import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { wikiPages } from "@agent-up/db/prisma/seed-data.mjs";
import { wikiCorpus } from "@agent-up/db/prisma/wiki-corpus.mjs";
import { rankPages, type RankablePage } from "@/lib/retrieval-bm25";
import { createInitialState } from "@/demo/seed";

/**
 * wiki 正文语料守卫（批⑧，风险 #10）。
 *
 * 迁移前 dev.db 里 4 行 WikiPage 的 content 就是 summary 本身（32/32/41/42 字节，
 * 全库正文 147 B），检索的「上下文」实际只有一句摘要；seed-data.mjs 声明的
 * filePath 在全仓 0 命中，等于指向不存在的文件。
 *
 * 本文件锁死修复后的三件事，任何一件退化都会挂测试：
 * 1. 正文有实质内容（长度、分节、且不等于摘要）；
 * 2. 两轨同源——数据库种子轨与浏览器演示轨读到的是同一份 wiki-corpus，
 *    且 wiki-corpus 与 knowledge 下的 markdown 逐字节一致（防「改了 md 忘了重新生成」）；
 * 3. filePath 与正文双向对齐——既不允许声明了却缺文件，也不允许有文件却没人引用。
 *
 * 纯静态断言 + 纯函数打分，PG-free。
 */

type AnyRec = Record<string, unknown>;
const pages = wikiPages as AnyRec[];
const corpus = wikiCorpus as Record<string, string>;

/** knowledge/ 在仓库根；本文件位于 apps/web/lib/__tests__/，故上溯四级 */
const markdownPath = (filePath: string): string =>
  readFileSync(new URL(`../../../../knowledge/${filePath}`, import.meta.url), "utf-8");

const MIN_BODY_BYTES = 600;

describe("wiki 正文语料完整性", () => {
  it("每个 seed filePath 都有非空正文，且逐字节等于磁盘 markdown", () => {
    for (const page of pages) {
      const filePath = page.filePath as string;
      expect(Object.hasOwn(corpus, filePath), `语料缺少 ${filePath}`).toBe(true);
      expect(corpus[filePath]).toBe(markdownPath(filePath));
    }
  });

  it("语料里没有孤立键（新增 markdown 必须同时被某个 wikiPage 引用）", () => {
    const declared = new Set(pages.map((p) => p.filePath as string));
    for (const key of Object.keys(corpus)) {
      expect(declared.has(key), `孤立正文：${key}`).toBe(true);
    }
  });

  it("正文是成篇文档而非摘要：够长、带小节标题、且不等于 summary", () => {
    for (const page of pages) {
      const filePath = page.filePath as string;
      const body = corpus[filePath];
      expect(Buffer.byteLength(body, "utf-8"), filePath).toBeGreaterThan(MIN_BODY_BYTES);
      expect(body).toContain("## ");
      expect(body).not.toBe(page.summary);
      // 摘要仍是独立字段，正文入库不该把它挤掉
      expect((page.summary as string).length).toBeGreaterThan(0);
    }
  });
});

describe("两轨同源", () => {
  it("演示轨 createInitialState 的正文与语料一致", () => {
    const state = createInitialState() as unknown as {
      wikiPages: Record<string, AnyRec[]>;
    };
    const flat = Object.values(state.wikiPages).flat();
    expect(flat).toHaveLength(pages.length);
    for (const page of flat) {
      expect(page.content).toBe(corpus[page.filePath as string]);
    }
  });
});

describe("正文入库后的检索效果（风险 #10 的验收证据）", () => {
  const toRankable = (page: AnyRec, useSummaryAsBody: boolean): RankablePage => ({
    id: page.id as string,
    title: page.title as string,
    slug: page.slug as string,
    summary: page.summary as string,
    content: useSummaryAsBody
      ? (page.summary as string)
      : corpus[page.filePath as string],
    tags: (page.tags as string[]) ?? [],
    baseConfidence: page.baseConfidence as number,
  });

  /** 只看 ecs-wiki 的三页——与真实轨的按 vault 取候选一致 */
  const ecsCandidates = (useSummaryAsBody: boolean): RankablePage[] =>
    pages
      .filter((p) => p.vaultId === "ecs-wiki")
      .map((p) => toRankable(p, useSummaryAsBody));

  const QUERY = "ssh 连不上服务器了，一直超时怎么排查";

  it("口语化查询命中 SSH 排查页，且带出成段正文作为上下文", () => {
    const outcome = rankPages(ecsCandidates(false), QUERY, 5, 0.5);
    expect(outcome.results.length).toBeGreaterThan(0);
    expect(outcome.results[0].pageId).toBe("page-ecs-ssh");
    // excerpt 取 content 前 400 字符：正文入库前它只有一句摘要
    expect(outcome.results[0].excerpt.length).toBeGreaterThan(200);
    expect(outcome.results[0].excerpt).toContain("nc -vz");
  });

  it("同一查询下，正文入库的原始分高于「正文=摘要」（量化风险 #10 的代价）", () => {
    const withBody = rankPages(ecsCandidates(false), QUERY, 5, 0.5);
    const summaryOnly = rankPages(ecsCandidates(true), QUERY, 5, 0.5);
    const hit = withBody.results.find((r) => r.pageId === "page-ecs-ssh");
    const before = summaryOnly.results.find((r) => r.pageId === "page-ecs-ssh");
    expect(hit).toBeDefined();
    expect(before).toBeDefined();
    expect(hit!.score).toBeGreaterThan(before!.score);
    expect(summaryOnly.results[0].excerpt.length).toBeLessThan(100);
  });
});
