import { describe, expect, it } from "vitest";
import {
  countToken,
  rankPages,
  scorePage,
  tfSat,
  tokenize,
  type RankablePage,
} from "@/lib/retrieval-bm25";

/**
 * BM25-lite 纯算法层的基线测试（零依赖，PG-free 可跑）。
 *
 * 定位：这是检索打分语义的「测量基线」。批5 评审指出 CJK 单字分词存在
 * 「不/的」这类高频字权重污染问题（候选预筛/停字表是待议改进），任何
 * 分词或打分改动都必须先让本文件记录改动前的精确行为，再在改动后
 * 逐条审视哪些断言应当变化、哪些是回归。
 *
 * 与服务端 retrieval-service.test.ts 的分工：那边在 PG 环境验证
 * service 层接线（loadPages/门限/fallback），这里只锁纯函数语义。
 */

const page = (overrides: Partial<RankablePage> = {}): RankablePage => ({
  id: "p1",
  title: "",
  slug: "p1",
  summary: null,
  content: null,
  tags: [],
  baseConfidence: 0.5,
  ...overrides,
});

describe("tokenize：中文单字+bigram、拉丁整词、全小写", () => {
  it("CJK 串 → 逐字 + 相邻双字（安全组 → 安/安全/全/全组/组）", () => {
    expect(tokenize("安全组")).toEqual(["安", "安全", "全", "全组", "组"]);
  });

  it("拉丁串按整词切分并转小写，不做子词拆分", () => {
    expect(tokenize("SSH Connection")).toEqual(["ssh", "connection"]);
  });

  it("混排文本按 CJK 段与拉丁段分别处理（标点是非分段符）", () => {
    // "SSH连接故障" → 拉丁段 "ssh" + CJK 段 "连接故障"
    expect(tokenize("SSH连接故障")).toEqual([
      "ssh",
      "连",
      "连接",
      "接",
      "接故",
      "故",
      "故障",
      "障",
    ]);
  });

  it("非 CJK/拉丁字符（→ 等）只是分段符，自身不产生 token", () => {
    expect(tokenize("白名单→账号")).toEqual([
      "白",
      "白名",
      "名",
      "名单",
      "单",
      "账",
      "账号",
      "号",
    ]);
  });

  it("空串 → 空 token 列表", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("结构性保证：任何输入都不会产生空 token（countToken('') 会死循环，全靠此不变量兜底）", () => {
    const samples = [
      "",
      "  ",
      "→→→",
      "!!!",
      "安全组 ssh v2 123 ——测试",
      "一",
      "a",
    ];
    for (const s of samples) {
      for (const t of tokenize(s)) expect(t.length).toBeGreaterThan(0);
    }
  });
});

describe("tfSat：tf/(tf+k) 饱和，k=1.2", () => {
  it("tf=0 → 0；tf=1 → 1/2.2；高频词收益递减但不封顶", () => {
    expect(tfSat(0)).toBe(0);
    expect(tfSat(1)).toBeCloseTo(1 / 2.2, 12);
    expect(tfSat(2)).toBeGreaterThan(tfSat(1));
    expect(tfSat(100)).toBeLessThan(1);
  });
});

describe("countToken：短 token 子串计数、长 token 词边界计数", () => {
  it("长度 ≤2（含全部 CJK 单字/bigram）走子串计数，不重叠", () => {
    expect(countToken("安全", "安全安全")).toBe(2);
    expect(countToken("组", "组班组")).toBe(2);
    expect(countToken("ab", "abab")).toBe(2);
  });

  it("长度 >2（拉丁整词）走 \\b 词边界：sshx 不算 ssh 的命中", () => {
    expect(countToken("ssh", "ssh sshx ssh")).toBe(2);
  });

  it("零命中 → 0", () => {
    expect(countToken("zzzz", "安全组配置指南")).toBe(0);
  });

  it("已知陷阱（文档化行为）：CJK token 长度 >2 时 \\b 恒不成立、恒返回 0。" +
    "tokenize 只产出长度 ≤2 的 CJK token，因此该路径在模块内部不可达，" +
    "但直接以长 CJK 串调用本函数会静默得到 0", () => {
    expect(countToken("安全组配置", "安全组配置指南 安全组配置")).toBe(0);
  });
});

describe("scorePage：字段权重 title×3 / tags×2 / summary×1 / content×0.5", () => {
  it("单 token 命中四字段的精确分值：6.5 × tfSat(1)", () => {
    const p = page({
      title: "ssh",
      tags: ["ssh"],
      summary: "ssh",
      content: "ssh",
    });
    const expected = (3 + 2 + 1 + 0.5) * tfSat(1);
    expect(scorePage(p, ["ssh"])).toBeCloseTo(expected, 12);
  });

  it("标题命中是内容命中的 6 倍权重", () => {
    const inTitle = page({ title: "ssh", content: "无关正文" });
    const inContent = page({ title: "无关标题", content: "ssh" });
    const a = scorePage(inTitle, ["ssh"]);
    const b = scorePage(inContent, ["ssh"]);
    expect(a).toBeCloseTo(b * 6, 12);
  });

  it("多 token 计分累加；未命中字段贡献 0（null 安全）", () => {
    const p = page({ title: "安全组", summary: null, content: null });
    // 查询「安全组」产出 5 个 token，全部命中标题
    expect(scorePage(p, tokenize("安全组"))).toBeGreaterThan(0);
    expect(scorePage(page(), ["ssh"])).toBe(0);
  });
});

describe("rankPages：归一化、门限切分与截断", () => {
  const corpus = [
    page({ id: "hit-title", title: "安全组", baseConfidence: 0.5 }),
    page({ id: "hit-content", title: "网络基础", content: "安全组相关说明" }),
    // miss 页必须与「安全组」的全部 5 个 token（安/安全/全/全组/组）零重叠——
    // 连「完全」都含单字「全」，这正是单字分词权重污染的实例（见文件头注释）
    page({ id: "miss", title: "数据库备份", content: "对象存储" }),
  ];

  it("confidence = 0.6×归一化分 + 0.4×baseConfidence；榜首归一化分恒为 1", () => {
    const { results } = rankPages(corpus, "安全组", 5, 0.35);
    const top = results.find((r) => r.pageId === "hit-title")!;
    expect(top.confidence).toBeCloseTo(0.6 * 1 + 0.4 * 0.5, 2);
  });

  it("结果按 score 降序；usedInContext 仅 results 为 true", () => {
    const { results, belowThreshold } = rankPages(corpus, "安全组", 5, 0.05);
    expect(results.map((r) => r.pageId)).toEqual(["hit-title", "hit-content"]);
    expect(results.every((r) => r.usedInContext)).toBe(true);
    expect(belowThreshold.every((m) => m.score === 0)).toBe(true);
  });

  it("零分页绝不进 results（score>0 硬前提），threshold=0 + base=1 也一样", () => {
    const tricky = [
      page({ id: "zero", title: "无关页", baseConfidence: 1 }),
    ];
    const { results, belowThreshold } = rankPages(tricky, "安全组", 5, 0);
    expect(results).toEqual([]);
    expect(belowThreshold).toHaveLength(1);
    expect(belowThreshold[0].confidence).toBeCloseTo(0.4, 2);
  });

  it("maxResults 截断：第 3 名落入 belowThreshold 而非被丢弃", () => {
    const three = [
      page({ id: "a", title: "安全组" }),
      page({ id: "b", title: "安全组", content: "安全组补充" }),
      page({ id: "c", title: "安全组", content: "安全组补充补充" }),
    ];
    const { results, belowThreshold } = rankPages(three, "安全组", 2, 0);
    expect(results).toHaveLength(2);
    expect(belowThreshold).toHaveLength(1);
    expect(belowThreshold[0].score).toBeGreaterThan(0);
  });

  it("excerpt 取 content 前 400 字", () => {
    const long = "x".repeat(500);
    const { results } = rankPages([page({ title: "安全组", content: long })], "安全组", 5, 0);
    expect(results[0].excerpt).toHaveLength(400);
  });

  it("candidates 只是透传计数：调用方可用 DB 侧预筛的候选集大小覆盖", () => {
    const { candidates } = rankPages(corpus, "安全组", 5, 0.35, 42);
    expect(candidates).toBe(42);
  });

  it("空候选集 → 空 results/belowThreshold，不产生 NaN", () => {
    const out = rankPages([], "安全组", 5, 0.35);
    expect(out).toEqual({ candidates: 0, results: [], belowThreshold: [] });
  });
});
