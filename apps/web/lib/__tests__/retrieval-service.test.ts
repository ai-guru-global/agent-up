import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { _setDataDir } from "@/lib/data/store";
import { searchWiki } from "@/lib/services/retrieval-service";

/** 在临时 dataDir 下写一个 wiki page JSON */
function seedPage(vaultId: string, page: Record<string, unknown>) {
  const dir = join(tmpdir(), "retrieval-test", "wiki-vaults", vaultId, "pages");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${page.id}.json`), JSON.stringify(page, null, 2));
}

const BASE_PAGE = {
  vaultId: "test-wiki",
  slug: "ssh-guide",
  lifecycle: "REVIEWED",
  tier: "CORE",
  baseConfidence: 0.8,
  wikilinks: [],
  categories: [],
  tags: [],
  filePath: "network/ssh-guide.md",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

let dataDir: string;

beforeEach(() => {
  dataDir = join(tmpdir(), `retrieval-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  _setDataDir(dataDir);
});

afterEach(() => {
  _setDataDir(null);
});

describe("searchWiki", () => {
  it("returns empty when vaultId is empty or agent has no vault", async () => {
    const r = await searchWiki({ query: "SSH 连接", vaultId: "", maxResults: 5, confidenceThreshold: 0.5 });
    expect(r.results).toEqual([]);
    expect(r.fallbackTriggered).toBe(true);
  });

  it("ranks pages by BM25-lite score and returns top-K", async () => {
    seedPage("test-wiki", {
      ...BASE_PAGE,
      id: "page-ssh",
      title: "SSH 无法连接排查指南",
      summary: "SSH 连接 ECS 失败的排查流程，覆盖安全组、密钥、服务状态",
      content: "当用户报告 SSH 无法连接 ECS 实例时，应按以下步骤排查：1. 检查安全组是否放通 22 端口...",
      tags: ["SSH", "网络", "安全组"],
    });
    seedPage("test-wiki", {
      ...BASE_PAGE,
      id: "page-disk",
      title: "云盘扩容操作指南",
      summary: "在线扩容和离线扩容的操作步骤",
      content: "云盘扩容前建议先创建快照...",
      tags: ["云盘", "扩容", "存储"],
    });

    const r = await searchWiki({ query: "SSH 连接失败", vaultId: "test-wiki", maxResults: 5, confidenceThreshold: 0.1 });
    expect(r.results.length).toBe(2);
    // SSH page should rank higher
    expect(r.results[0].pageId).toBe("page-ssh");
    expect(r.results[0].score).toBeGreaterThan(r.results[1].score);
  });

  it("filters pages below confidenceThreshold into belowThreshold list", async () => {
    seedPage("test-wiki", {
      ...BASE_PAGE,
      id: "page-ssh",
      title: "SSH 排查指南",
      summary: "SSH 连接失败排查",
      content: "检查安全组 22 端口放通情况",
      tags: ["SSH"],
      baseConfidence: 0.9,
    });
    seedPage("test-wiki", {
      ...BASE_PAGE,
      id: "page-unrelated",
      title: "对象存储使用教程",
      summary: "OSS 基本操作",
      content: "创建 Bucket、上传文件",
      tags: ["OSS"],
      baseConfidence: 0.3,
    });

    const r = await searchWiki({ query: "SSH 连不上", vaultId: "test-wiki", maxResults: 5, confidenceThreshold: 0.7 });
    // SSH page should be in results; unrelated page below threshold
    expect(r.results.length).toBe(1);
    expect(r.results[0].pageId).toBe("page-ssh");
    expect(r.belowThreshold.length).toBe(1);
    expect(r.belowThreshold[0].pageId).toBe("page-unrelated");
  });

  it("sets fallbackTriggered when all pages are below threshold", async () => {
    seedPage("test-wiki", {
      ...BASE_PAGE,
      id: "page-weak",
      title: "完全不相关页面",
      summary: "OSS",
      content: "OSS 操作",
      tags: [],
      baseConfidence: 0.1,
    });

    const r = await searchWiki({ query: "SSH 排查", vaultId: "test-wiki", maxResults: 5, confidenceThreshold: 0.99 });
    expect(r.results.length).toBe(0);
    expect(r.fallbackTriggered).toBe(true);
  });

  it("handles page with no content field gracefully (content treated as empty)", async () => {
    seedPage("test-wiki", {
      ...BASE_PAGE,
      id: "page-no-content",
      title: "SSH 排查",
      summary: "SSH 连接问题",
      tags: ["SSH"],
      // no content field — existing seed data has this pattern
    });

    const r = await searchWiki({ query: "SSH", vaultId: "test-wiki", maxResults: 5, confidenceThreshold: 0.1 });
    expect(r.results.length).toBe(1);
    expect(r.results[0].pageId).toBe("page-no-content");
  });

  it("returns empty results for non-existent vault", async () => {
    const r = await searchWiki({ query: "anything", vaultId: "nonexistent-vault", maxResults: 5, confidenceThreshold: 0.5 });
    expect(r.results).toEqual([]);
    expect(r.fallbackTriggered).toBe(true);
  });

  it("respects maxResults limit", async () => {
    for (let i = 0; i < 10; i++) {
      seedPage("test-wiki", {
        ...BASE_PAGE,
        id: `page-${i}`,
        title: `页面 ${i} 关于 SSH`,
        summary: "SSH 相关",
        content: "SSH 内容",
        tags: ["SSH"],
      });
    }

    const r = await searchWiki({ query: "SSH", vaultId: "test-wiki", maxResults: 3, confidenceThreshold: 0.1 });
    expect(r.results.length).toBe(3);
  });

  it("includes excerpt (first 400 chars of content) in results", async () => {
    const longContent = "A".repeat(800);
    seedPage("test-wiki", {
      ...BASE_PAGE,
      id: "page-long",
      title: "SSH 排查",
      summary: "SSH",
      content: longContent,
      tags: [],
    });

    const r = await searchWiki({ query: "SSH", vaultId: "test-wiki", maxResults: 5, confidenceThreshold: 0.1 });
    expect(r.results[0].excerpt.length).toBeLessThanOrEqual(400);
  });

  it("marks usedInContext true for results above threshold", async () => {
    seedPage("test-wiki", {
      ...BASE_PAGE,
      id: "page-good",
      title: "SSH 排查指南",
      summary: "SSH 连接失败排查",
      content: "检查安全组",
      tags: ["SSH"],
      baseConfidence: 0.9,
    });

    const r = await searchWiki({ query: "SSH 排查", vaultId: "test-wiki", maxResults: 5, confidenceThreshold: 0.1 });
    expect(r.results[0].usedInContext).toBe(true);
  });
});
