import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as searchVault } from "@/app/api/wiki/vaults/[id]/search/route";
import { prisma } from "@agent-up/db";
import { _resetDb } from "@/lib/data/test-db";

const VAULT_ID = "search-vault";

function req(id: string, query = ""): NextRequest {
  const url = `http://localhost/api/wiki/vaults/${id}/search${query ? `?${query}` : ""}`;
  return new NextRequest(url);
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function seedPage(page: Record<string, unknown>) {
  await prisma.wikiPage.create({
    data: {
      lifecycle: "VERIFIED",
      tier: "CORE",
      baseConfidence: 0.8,
      wikilinks: [],
      categories: [],
      tags: [],
      sourceRefs: [],
      vaultId: VAULT_ID,
      title: "页面",
      slug: (page.id as string) ?? "page",
      content: "",
      filePath: `${(page.id as string) ?? "page"}.md`,
      ...page,
    } as never,
  });
}

beforeEach(async () => {
  await _resetDb();
  await prisma.wikiVault.create({ data: { id: VAULT_ID, name: "检索测试库" } });
});

describe("GET /api/wiki/vaults/[id]/search", () => {
  it("200 返回 BM25-lite 排序结果，最高分在前", async () => {
    await seedPage({
      id: "page-ssh",
      title: "SSH 无法连接排查指南",
      summary: "SSH 连接 ECS 失败的排查流程",
      content: "当用户报告 SSH 无法连接 ECS 实例时，先检查安全组 22 端口",
      tags: ["SSH", "网络"],
    });
    await seedPage({
      id: "page-disk",
      title: "云盘扩容操作指南",
      summary: "在线扩容和离线扩容的操作步骤",
      content: "云盘扩容前建议先创建快照",
      tags: ["云盘", "扩容"],
    });

    const res = await searchVault(
      req(VAULT_ID, `q=${encodeURIComponent("SSH 连接失败")}`),
      ctx(VAULT_ID),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.strategy).toBe("BM25_LITE");
    expect(json.data.candidates).toBe(2);
    expect(json.data.results[0].pageId).toBe("page-ssh");
    expect(json.data.results[0].usedInContext).toBe(true);
    expect(typeof json.data.results[0].excerpt).toBe("string");
  });

  it("404 vault 不存在", async () => {
    const res = await searchVault(req("ghost", "q=SSH"), ctx("ghost"));
    expect(res.status).toBe(404);
  });

  it("422 缺少 q 参数", async () => {
    const res = await searchVault(req(VAULT_ID), ctx(VAULT_ID));
    expect(res.status).toBe(422);
  });

  it("422 limit 越界", async () => {
    const res = await searchVault(req(VAULT_ID, "q=SSH&limit=99"), ctx(VAULT_ID));
    expect(res.status).toBe(422);
  });

  it("limit 与 threshold 生效：超出 maxResults 的候选入 belowThreshold", async () => {
    for (let i = 0; i < 3; i++) {
      await seedPage({
        id: `page-ssh-${i}`,
        title: `SSH 排查场景 ${i}`,
        summary: "SSH 连接失败排查",
        content: "检查安全组与密钥",
        tags: ["SSH"],
      });
    }
    await seedPage({
      id: "page-oss",
      title: "对象存储使用教程",
      summary: "OSS 基本操作",
      content: "创建 Bucket、上传文件",
      tags: ["OSS"],
      baseConfidence: 0.1,
    });

    const res = await searchVault(
      req(VAULT_ID, "q=SSH&limit=2&threshold=0.1"),
      ctx(VAULT_ID),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.results.length).toBe(2);
    // 服务语义：limit 耗尽后的第 3 条 SSH 页与低于阈值的 OSS 页都归入 belowThreshold
    expect(json.data.belowThreshold.length).toBe(2);
    expect(json.data.fallbackTriggered).toBe(false);
    expect(json.data.results.every((r: { usedInContext: boolean }) => r.usedInContext)).toBe(true);
  });

  it("全部候选低于阈值时 fallbackTriggered=true", async () => {
    await seedPage({
      id: "page-weak",
      title: "完全不相关页面",
      summary: "OSS",
      content: "OSS 操作",
      tags: [],
      baseConfidence: 0.1,
    });

    const res = await searchVault(req(VAULT_ID, "q=SSH&threshold=0.99"), ctx(VAULT_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.results).toEqual([]);
    expect(json.data.fallbackTriggered).toBe(true);
    expect(json.data.belowThreshold.length).toBe(1);
  });
});
