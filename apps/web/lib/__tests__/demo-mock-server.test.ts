import { beforeEach, describe, expect, it } from "vitest";
import { handleMockRequest, resetDemoState } from "@/demo/mock-server";

/**
 * demo/mock-server.ts 的边界测试。
 *
 * mock-server 是静态演示轨唯一的 API 实现（install-fetch.ts 在浏览器里拦截
 * /api/* 后调用 handleMockRequest），它必须与真实轨 route handler 保持
 * 「同形」：同样的 success/error 包裹、同样的状态码语义、同样的字段集合。
 * 这里在 install-fetch 使用的同一入口上锁定该契约，防止两轨漂移。
 *
 * 测试不需要 PostgreSQL：种子数据来自 packages/db/prisma/seed-data.mjs 静态模块。
 */

const get = (pathname: string, query = "") =>
  handleMockRequest("GET", pathname, new URLSearchParams(query), undefined);

const post = (pathname: string, body?: unknown) =>
  handleMockRequest("POST", pathname, new URLSearchParams(), body);

beforeEach(() => {
  resetDemoState();
});

describe("认证端点：与真实轨同形", () => {
  it("正确凭据 → 200，data 字段集合与真实登录一致，sessionIssued 恒为 false", () => {
    const res = post("/api/auth/login", {
      email: "allengaller@example.com",
      password: "AgentUp#Demo2026",
    });
    expect(res.status).toBe(200);
    const body = res.body as { success: boolean; data: Record<string, unknown> };
    expect(body.success).toBe(true);
    // 字段集合逐字对齐 app/api/auth/login/route.ts 的 success({...})，
    // 防止前端按「某个字段是否存在」分叉出两套逻辑
    expect(Object.keys(body.data).sort()).toEqual(
      ["name", "sessionIssued", "userId", "username"].sort(),
    );
    // 静态轨没有服务端密钥，签不出令牌；与真实轨「AUTH_SECRET 缺失」时同形
    expect(body.data.sessionIssued).toBe(false);
    expect(body.data.username).toBe("allengaller@example.com");
  });

  it("缺凭据 → 400，错误体只有 success/error 两个字段", () => {
    const res = post("/api/auth/login", { email: "allengaller@example.com" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "请填写邮箱和密码",
    });
  });

  it("错误口令 → 401", () => {
    const res = post("/api/auth/login", {
      email: "allengaller@example.com",
      password: "wrong",
    });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: "邮箱或密码错误",
    });
  });

  it("登出幂等：任意 body、重复调用，结果恒为 200 + { loggedOut: true }", () => {
    const first = post("/api/auth/logout");
    const second = post("/api/auth/logout", { anything: 1 });
    expect(first).toEqual(second);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ success: true, data: { loggedOut: true } });
  });

  it("登出只注册了 POST：GET → 404（与真实轨一致）", () => {
    const res = get("/api/auth/logout");
    expect(res.status).toBe(404);
  });
});

describe("wiki search：先校验（422）后查库（404）", () => {
  it("vault 不存在 + 缺 q → 422 而非 404（校验先行）", () => {
    const res = get("/api/wiki/vaults/no-such-vault/search");
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ success: false, error: "检索参数不合法" });
  });

  it.each([
    ["limit=0"],
    ["limit=21"],
    ["limit=1.5"],
    ["limit=abc"],
    ["threshold=-0.1"],
    ["threshold=1.5"],
    ["threshold=abc"],
  ])("%s → 422", (query) => {
    const res = get("/api/wiki/vaults/ecs-wiki/search", `q=安全组&${query}`);
    expect(res.status).toBe(422);
  });

  it("q 超过 500 字 → 422", () => {
    const res = get("/api/wiki/vaults/ecs-wiki/search", `q=${"长".repeat(501)}`);
    expect(res.status).toBe(422);
  });

  it("参数合法但 vault 不存在 → 404 Vault 不存在", () => {
    const res = get("/api/wiki/vaults/no-such-vault/search", "q=安全组");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Vault 不存在" });
  });
});

describe("wiki search：响应形状与打分语义", () => {
  it("命中：字段集合、strategy、candidates 与真实轨 searchWiki 逐字对齐", () => {
    const res = get("/api/wiki/vaults/ecs-wiki/search", "q=安全组");
    expect(res.status).toBe(200);
    const data = (res.body as { success: boolean; data: Record<string, unknown> })
      .data;
    expect(Object.keys(data).sort()).toEqual(
      [
        "query",
        "strategy",
        "candidates",
        "results",
        "belowThreshold",
        "fallbackTriggered",
      ].sort(),
    );
    expect(data.strategy).toBe("BM25_LITE");
    // ecs-wiki 种子共 3 页：candidates 是进入打分的页面数，与真实轨 pages.length 同源
    expect(data.candidates).toBe(3);
    expect(data.fallbackTriggered).toBe(false);

    const results = data.results as Array<Record<string, unknown>>;
    expect(results.length).toBeGreaterThan(0);
    // 「安全组」标题精确命中 page-ecs-sg，权重 title×3 应排第一
    expect(results[0].pageId).toBe("page-ecs-sg");
    for (const hit of results) {
      expect(Object.keys(hit).sort()).toEqual(
        [
          "pageId",
          "title",
          "slug",
          "score",
          "confidence",
          "excerpt",
          "usedInContext",
        ].sort(),
      );
      expect(hit.score).toBeGreaterThan(0);
      expect(hit.usedInContext).toBe(true);
    }
    // 结果按 score 降序
    const scores = results.map((r) => r.score as number);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("limit 生效：结果数不超过 maxResults", () => {
    const res = get("/api/wiki/vaults/ecs-wiki/search", "q=安全组&limit=1");
    const data = (res.body as { data: { results: unknown[] } }).data;
    expect(data.results.length).toBe(1);
  });

  it("零词面重叠的查询 → results 空、fallbackTriggered、全部页落入 belowThreshold 且 score=0", () => {
    const res = get("/api/wiki/vaults/ecs-wiki/search", "q=zzzz");
    expect(res.status).toBe(200);
    const data = (res.body as { data: Record<string, unknown> }).data;
    expect(data.results).toEqual([]);
    expect(data.fallbackTriggered).toBe(true);
    // 零分页不凭 baseConfidence 底数混入上下文：3 页全部进 belowThreshold
    expect(data.candidates).toBe(3);
    const misses = data.belowThreshold as Array<{ score: number }>;
    expect(misses.length).toBe(3);
    expect(misses.every((m) => m.score === 0)).toBe(true);
  });

  it("threshold=1 也拦不住合法命中之外的高分页越门限：confidence<1 时 results 为空", () => {
    // confidence = 0.6×norm + 0.4×base，最高 base=0.95 → 上限 0.98 < 1
    const res = get("/api/wiki/vaults/ecs-wiki/search", "q=安全组&threshold=1");
    const data = (res.body as { data: { results: unknown[]; belowThreshold: unknown[] } })
      .data;
    expect(data.results).toEqual([]);
    expect(data.belowThreshold.length).toBe(3);
  });

  it("score>0 是硬前提：threshold=0 也不会把零分页放进 results", () => {
    const res = get("/api/wiki/vaults/ecs-wiki/search", "q=zzzz&threshold=0");
    const data = (res.body as { data: { results: unknown[] } }).data;
    expect(data.results).toEqual([]);
  });
});

describe("通用行为", () => {
  it("未知接口 → 404 且错误信息带方法与路径", () => {
    const res = get("/api/foo");
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe(
      "接口不存在：GET /api/foo",
    );
  });

  it("resetDemoState 还原内存态：建 Agent 后重置，回到种子基线", () => {
    const before = get("/api/agents");
    const baseline = (before.body as { data: { pagination: { total: number } } })
      .data.pagination.total;

    // 需要已存在的产品组；从列表里取一个真实 id，避免硬编码种子 id。
    // product-groups 的 GET 返回裸数组（ok(state.productGroups)），不是 { items }
    const groups = get("/api/settings/product-groups");
    const groupId = (groups.body as { data: Array<{ id: string }> }).data[0].id;
    const created = post("/api/agents", {
      name: "重置测试 Agent",
      productGroupId: groupId,
    });
    expect(created.status).toBe(201);

    const after = get("/api/agents");
    expect(
      (after.body as { data: { pagination: { total: number } } }).data.pagination
        .total,
    ).toBe(baseline + 1);

    resetDemoState();
    const restored = get("/api/agents");
    expect(
      (restored.body as { data: { pagination: { total: number } } }).data
        .pagination.total,
    ).toBe(baseline);
  });
});
