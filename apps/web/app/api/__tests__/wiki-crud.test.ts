import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as createVaultRoute } from "@/app/api/wiki/vaults/route";
import {
  GET as getVaultRoute,
  PUT as updateVaultRoute,
  DELETE as deleteVaultRoute,
} from "@/app/api/wiki/vaults/[id]/route";
import {
  GET as listPagesRoute,
  POST as createPageRoute,
} from "@/app/api/wiki/vaults/[id]/pages/route";
import {
  GET as getPageRoute,
  PUT as updatePageRoute,
  DELETE as deletePageRoute,
} from "@/app/api/wiki/pages/[id]/route";
import { adminActorHeaders, seedRbacAdmin } from "@/lib/__tests__/helpers/seed-db";
import { prisma } from "@agent-up/db";
import { _resetDb } from "@/lib/data/test-db";

/**
 * 批⑦ 覆盖率扩围：wiki 三个 [id] 路由与 vaults/[id]/pages 此前 0%。
 * 除 200/404/409/422/400/403 的映射外，重点锁三条 SQLite 化后的语义：
 * 1) tags / categories 是 TEXT 列，写数组读回来必须仍是数组；
 * 2) lifecycle/tier 走 SQL where，tag/search 走取数后内存过滤（两条分支都测）；
 * 3) path 上的 id 是权威 vaultId，DELETE vault 靠 FK CASCADE 带走页面。
 */

const HEADERS = { "Content-Type": "application/json", ...adminActorHeaders };

function req(url: string, method: string, body?: unknown, headers = HEADERS) {
  return new NextRequest(url, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers,
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function makeVault(name = "wiki-crud-vault"): Promise<string> {
  const res = await createVaultRoute(req("http://localhost/api/wiki/vaults", "POST", { name }));
  expect(res.status).toBe(201);
  return (await res.json()).data.id as string;
}

async function makePage(
  vaultId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const slug = (overrides.slug as string) ?? `page-${Math.random().toString(36).slice(2, 8)}`;
  const res = await createPageRoute(
    req(`http://localhost/api/wiki/vaults/${vaultId}/pages`, "POST", {
      vaultId,
      title: (overrides.title as string) ?? `页面 ${slug}`,
      slug,
      content: (overrides.content as string) ?? "正文内容",
      ...overrides,
    }),
    ctx(vaultId),
  );
  expect(res.status).toBe(201);
  return (await res.json()).data.id as string;
}

beforeEach(async () => {
  await _resetDb();
  await seedRbacAdmin();
});

describe("GET/PUT/DELETE /api/wiki/vaults/[id]", () => {
  it("GET 返回库详情（_count 关联计数、未绑 agent 时 agent 为 null）", async () => {
    const id = await makeVault();
    const res = await getVaultRoute(req(`http://localhost/api/wiki/vaults/${id}`, "GET"), ctx(id));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.name).toBe("wiki-crud-vault");
    expect(data.gitBranch).toBe("main");
    expect(data.agent).toBeNull();
    expect(data._count).toEqual({ pages: 0, ingestJobs: 0 });
  });

  it("GET 不存在 → 404 Vault 不存在", async () => {
    const res = await getVaultRoute(
      req("http://localhost/api/wiki/vaults/ghost", "GET"),
      ctx("ghost"),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Vault 不存在");
  });

  it("PUT 改名字与共享标记", async () => {
    const id = await makeVault();
    const res = await updateVaultRoute(
      req(`http://localhost/api/wiki/vaults/${id}`, "PUT", { name: "改名库", isShared: true }),
      ctx(id),
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.name).toBe("改名库");
    expect(data.isShared).toBe(true);
  });

  it("PUT gitRepoUrl 非法 → 422；body 不可解析 → 400", async () => {
    const id = await makeVault();
    const bad = await updateVaultRoute(
      req(`http://localhost/api/wiki/vaults/${id}`, "PUT", { gitRepoUrl: "not-a-url" }),
      ctx(id),
    );
    expect(bad.status).toBe(422);

    const unparseable = await updateVaultRoute(
      new NextRequest(`http://localhost/api/wiki/vaults/${id}`, {
        method: "PUT",
        body: "not-json",
        headers: HEADERS,
      }),
      ctx(id),
    );
    expect(unparseable.status).toBe(400);
    expect((await unparseable.json()).error).toBe("无效的请求体");
  });

  it("PUT 目标不存在 → 404；无身份头 → 403", async () => {
    expect((await updateVaultRoute(req("http://localhost/x", "PUT", { name: "x" }), ctx("ghost"))).status).toBe(
      404,
    );
    const forbidden = await updateVaultRoute(
      req(
        "http://localhost/api/wiki/vaults/v",
        "PUT",
        { name: "越权" },
        { "Content-Type": "application/json" },
      ),
      ctx("v"),
    );
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).code).toBe("AUTHORIZATION");
  });

  it("DELETE 连带删除页面（FK CASCADE），之后再 GET 均 404", async () => {
    const vaultId = await makeVault();
    const pageId = await makePage(vaultId, { slug: "cascade" });

    const res = await deleteVaultRoute(
      req(`http://localhost/api/wiki/vaults/${vaultId}`, "DELETE"),
      ctx(vaultId),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.message).toBe("Vault 已删除");

    expect((await getVaultRoute(req("http://localhost/x", "GET"), ctx(vaultId))).status).toBe(404);
    expect((await getPageRoute(req("http://localhost/x", "GET"), ctx(pageId))).status).toBe(404);
    await expect(prisma.wikiPage.count({ where: { vaultId } })).resolves.toBe(0);
  });

  it("DELETE 不存在 → 404", async () => {
    const res = await deleteVaultRoute(req("http://localhost/x", "DELETE"), ctx("ghost"));
    expect(res.status).toBe(404);
  });
});

describe("GET/POST /api/wiki/vaults/[id]/pages", () => {
  it("GET 分页元数据：total/totalPages/hasMore 随页位变化", async () => {
    const vaultId = await makeVault();
    for (const slug of ["a", "b", "c"]) await makePage(vaultId, { slug });

    const p1 = await (
      await listPagesRoute(req(`http://localhost/api/wiki/vaults/${vaultId}/pages?page=1&pageSize=2`, "GET"), ctx(vaultId))
    ).json();
    expect(p1.data.items).toHaveLength(2);
    expect(p1.data.pagination).toEqual({
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
      hasMore: true,
    });

    const p2 = await (
      await listPagesRoute(req(`http://localhost/api/wiki/vaults/${vaultId}/pages?page=2&pageSize=2`, "GET"), ctx(vaultId))
    ).json();
    expect(p2.data.items).toHaveLength(1);
    expect(p2.data.pagination.hasMore).toBe(false);
  });

  it("GET lifecycle / tier 走 SQL 过滤：默认 DRAFT + SPECIALIZED", async () => {
    const vaultId = await makeVault();
    await makePage(vaultId, { slug: "draft-one" });
    await makePage(vaultId, { slug: "verified-one", lifecycle: "VERIFIED", tier: "CORE" });

    const drafts = await (
      await listPagesRoute(req(`http://localhost/api/wiki/vaults/${vaultId}/pages?lifecycle=DRAFT`, "GET"), ctx(vaultId))
    ).json();
    expect(drafts.data.items.map((p: { slug: string }) => p.slug)).toEqual(["draft-one"]);

    const core = await (
      await listPagesRoute(req(`http://localhost/api/wiki/vaults/${vaultId}/pages?tier=CORE`, "GET"), ctx(vaultId))
    ).json();
    expect(core.data.items.map((p: { slug: string }) => p.slug)).toEqual(["verified-one"]);

    const all = await (
      await listPagesRoute(req(`http://localhost/api/wiki/vaults/${vaultId}/pages?lifecycle=ALL`, "GET"), ctx(vaultId))
    ).json();
    expect(all.data.pagination.total).toBe(2);
  });

  it("GET search 走取数后内存过滤（SQLite 无 insensitive），total 为过滤后口径", async () => {
    const vaultId = await makeVault();
    await makePage(vaultId, { slug: "sg", title: "安全组规则", content: "authorize 端口" });
    await makePage(vaultId, { slug: "disk", title: "磁盘扩容", content: "resize 磁盘" });

    const byTitle = await (
      await listPagesRoute(req(`http://localhost/api/wiki/vaults/${vaultId}/pages?search=安全组`, "GET"), ctx(vaultId))
    ).json();
    expect(byTitle.data.items.map((p: { slug: string }) => p.slug)).toEqual(["sg"]);
    expect(byTitle.data.pagination.total).toBe(1);

    const byContent = await (
      await listPagesRoute(req(`http://localhost/api/wiki/vaults/${vaultId}/pages?search=RESIZE`, "GET"), ctx(vaultId))
    ).json();
    expect(byContent.data.items.map((p: { slug: string }) => p.slug)).toEqual(["disk"]);

    const none = await (
      await listPagesRoute(req(`http://localhost/api/wiki/vaults/${vaultId}/pages?search=不存在的关键字`, "GET"), ctx(vaultId))
    ).json();
    expect(none.data.items).toEqual([]);
    expect(none.data.pagination.total).toBe(0);
  });

  it("POST 创建页面落到 path 的 vault 下，缺省口径 DRAFT/SPECIALIZED/0.5", async () => {
    const vaultId = await makeVault();
    const res = await createPageRoute(
      req(`http://localhost/api/wiki/vaults/${vaultId}/pages`, "POST", {
        vaultId: "other-vault-ignored",
        title: "路径权威",
        slug: "authoritative",
        content: "正文",
      }),
      ctx(vaultId),
    );
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.vaultId).toBe(vaultId);
    expect(data.filePath).toBe("authoritative.md");
    expect(data.lifecycle).toBe("DRAFT");
    expect(data.tier).toBe("SPECIALIZED");
    expect(data.baseConfidence).toBe(0.5);
    expect(data.provenance).toBe("EXTRACTED");
    expect(data.tags).toEqual([]);
  });

  it("POST 同库重复 slug → 409", async () => {
    const vaultId = await makeVault();
    await makePage(vaultId, { slug: "dup" });
    const res = await createPageRoute(
      req(`http://localhost/api/wiki/vaults/${vaultId}/pages`, "POST", {
        vaultId,
        title: "再来一次",
        slug: "dup",
        content: "正文",
      }),
      ctx(vaultId),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("同库下已存在相同 slug 的页面");
  });

  it("POST 缺 content → 422；path vault 不存在 → 404；无身份头 → 403", async () => {
    const vaultId = await makeVault();
    const invalid = await createPageRoute(
      req(`http://localhost/api/wiki/vaults/${vaultId}/pages`, "POST", {
        vaultId,
        title: "t",
        slug: "s",
      }),
      ctx(vaultId),
    );
    expect(invalid.status).toBe(422);

    const missingVault = await createPageRoute(
      req("http://localhost/api/wiki/vaults/ghost/pages", "POST", {
        vaultId: "ghost",
        title: "t",
        slug: "s",
        content: "c",
      }),
      ctx("ghost"),
    );
    expect(missingVault.status).toBe(404);

    const forbidden = await createPageRoute(
      req(
        `http://localhost/api/wiki/vaults/${vaultId}/pages`,
        "POST",
        { vaultId, title: "t", slug: "no-actor", content: "c" },
        { "Content-Type": "application/json" },
      ),
      ctx(vaultId),
    );
    expect(forbidden.status).toBe(403);
  });
});

describe("GET/PUT/DELETE /api/wiki/pages/[id]", () => {
  it("GET 返回页面与所属库，数组字段从 TEXT 还原成数组", async () => {
    const vaultId = await makeVault();
    const pageId = await makePage(vaultId, {
      slug: "round-trip",
      tags: ["网络", "安全组"],
      categories: ["运维"],
      wikilinks: ["其他页"],
    });

    const res = await getPageRoute(req(`http://localhost/api/wiki/pages/${pageId}`, "GET"), ctx(pageId));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.tags).toEqual(["网络", "安全组"]);
    expect(data.categories).toEqual(["运维"]);
    expect(data.wikilinks).toEqual(["其他页"]);
    expect(data.sourceRefs).toEqual([]);
    expect(data.vault).toEqual({ id: vaultId, name: "wiki-crud-vault" });
    expect(data.reviewedAt).toBeNull();
  });

  it("GET 不存在 → 404 Page 不存在", async () => {
    const res = await getPageRoute(req("http://localhost/api/wiki/pages/ghost", "GET"), ctx("ghost"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Page 不存在");
  });

  it("PUT 改 tags 后再 GET 仍是数组，正文同步", async () => {
    const vaultId = await makeVault();
    const pageId = await makePage(vaultId, { slug: "upd", tags: ["旧标签"] });

    const res = await updatePageRoute(
      req(`http://localhost/api/wiki/pages/${pageId}`, "PUT", {
        content: "新正文",
        lifecycle: "VERIFIED",
        tags: ["新标签", "第二个"],
      }),
      ctx(pageId),
    );
    expect(res.status).toBe(200);
    const updated = (await res.json()).data;
    expect(updated.lifecycle).toBe("VERIFIED");
    expect(updated.tags).toEqual(["新标签", "第二个"]);

    const got = await (await getPageRoute(req("http://localhost/x", "GET"), ctx(pageId))).json();
    expect(got.data.content).toBe("新正文");
    expect(got.data.tags).toEqual(["新标签", "第二个"]);
  });

  it("PUT baseConfidence 越界 → 422；目标不存在 → 404", async () => {
    const vaultId = await makeVault();
    const pageId = await makePage(vaultId, { slug: "conf" });
    expect(
      (await updatePageRoute(req("http://localhost/x", "PUT", { baseConfidence: 2 }), ctx(pageId))).status,
    ).toBe(422);
    expect(
      (await updatePageRoute(req("http://localhost/x", "PUT", { title: "x" }), ctx("ghost"))).status,
    ).toBe(404);
  });

  it("DELETE 后 GET 404；再 DELETE 同 id → 404", async () => {
    const vaultId = await makeVault();
    const pageId = await makePage(vaultId, { slug: "del" });

    const res = await deletePageRoute(req(`http://localhost/api/wiki/pages/${pageId}`, "DELETE"), ctx(pageId));
    expect(res.status).toBe(200);
    expect((await res.json()).data.message).toBe("Page 已删除");

    expect((await getPageRoute(req("http://localhost/x", "GET"), ctx(pageId))).status).toBe(404);
    expect((await deletePageRoute(req("http://localhost/x", "DELETE"), ctx(pageId))).status).toBe(404);
  });

  it("写操作无身份头 → 403（wiki:write 由服务层强制）", async () => {
    const vaultId = await makeVault();
    const pageId = await makePage(vaultId, { slug: "forbid" });
    const noActor = { "Content-Type": "application/json" };

    expect(
      (await updatePageRoute(req("http://localhost/x", "PUT", { title: "越权" }, noActor), ctx(pageId))).status,
    ).toBe(403);
    expect((await deletePageRoute(req("http://localhost/x", "DELETE", undefined, noActor), ctx(pageId))).status).toBe(
      403,
    );
  });
});
