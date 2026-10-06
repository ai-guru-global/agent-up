import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as createSkill } from "@/app/api/skills/route";
import {
  GET as getSkillRoute,
  PUT as updateSkillRoute,
  DELETE as deleteSkillRoute,
} from "@/app/api/skills/[id]/route";
import { adminActorHeaders, seedRbacAdmin } from "@/lib/__tests__/helpers/seed-db";
import { _resetDb } from "@/lib/data/test-db";

/**
 * 批⑦ 覆盖率扩围：/api/skills/[id] 三处理器此前 0%。
 * 重点锁两条容易被改坏的语义：
 * 1) 原 Json/数组列在 SQLite 下是 TEXT，PUT 传数组/对象后 GET 回来必须仍是数组/对象；
 * 2) DELETE 是归档（status=ARCHIVED）而非物理删除，历史绑定与审计署名不受损。
 */

const HEADERS = { "Content-Type": "application/json", ...adminActorHeaders };

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(method: string, body?: unknown, headers: Record<string, string> = HEADERS) {
  return new NextRequest("http://localhost/api/skills/x", {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers,
  });
}

async function makeSkill(name = "skill-detail-demo"): Promise<string> {
  const res = await createSkill(
    req("POST", {
      name,
      displayName: "详情示例",
      description: "描述",
      category: "DATA_FETCH",
      runtime: "MCP",
    }),
  );
  expect(res.status).toBe(201);
  const json = await res.json();
  return json.data.id as string;
}

beforeEach(async () => {
  await _resetDb();
  await seedRbacAdmin();
});

describe("GET /api/skills/[id]", () => {
  it("存在的 Skill 返回详情（含 bindings / versions 两个关联数组）", async () => {
    const id = await makeSkill();
    const res = await getSkillRoute(req("GET"), ctx(id));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.id).toBe(id);
    expect(data.displayName).toBe("详情示例");
    expect(data.bindings).toEqual([]);
    expect(data.versions).toEqual([]);
    expect(data._count).toEqual({ bindings: 0, versions: 0 });
  });

  it("不存在 → 404（GET 走 error() 而非 handleApiError()，故无 code 字段）", async () => {
    const res = await getSkillRoute(req("GET"), ctx("ghost"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Skill 不存在");
  });
});

describe("PUT /api/skills/[id]", () => {
  it("更新 triggerPatterns / inputSchema 后 GET 回来仍是数组与对象（TEXT 列往返）", async () => {
    const id = await makeSkill();
    const res = await updateSkillRoute(
      req("PUT", {
        displayName: "改名后",
        triggerPatterns: ["重启", "reboot"],
        inputSchema: { type: "object", properties: { instanceId: { type: "string" } } },
        status: "PUBLISHED",
      }),
      ctx(id),
    );
    expect(res.status).toBe(200);
    const updated = (await res.json()).data;
    expect(updated.displayName).toBe("改名后");
    expect(updated.status).toBe("PUBLISHED");

    const got = await (await getSkillRoute(req("GET"), ctx(id))).json();
    expect(got.data.triggerPatterns).toEqual(["重启", "reboot"]);
    expect(got.data.inputSchema).toEqual({
      type: "object",
      properties: { instanceId: { type: "string" } },
    });
  });

  it("status 越界 → 422 参数校验失败", async () => {
    const id = await makeSkill();
    const res = await updateSkillRoute(req("PUT", { status: "ARCHIVED" }), ctx(id));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("参数校验失败");
    expect(body.errors).toBeInstanceOf(Array);
  });

  it("body 不可解析 → 400 无效的请求体", async () => {
    const id = await makeSkill();
    const raw = new NextRequest("http://localhost/api/skills/x", {
      method: "PUT",
      body: "not-json",
      headers: HEADERS,
    });
    const res = await updateSkillRoute(raw, ctx(id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("无效的请求体");
  });

  it("目标不存在 → 404", async () => {
    const res = await updateSkillRoute(req("PUT", { displayName: "X" }), ctx("ghost"));
    expect(res.status).toBe(404);
  });

  it("无身份头 → 403（settings:admin 由服务层强制）", async () => {
    const id = await makeSkill();
    const res = await updateSkillRoute(
      req("PUT", { displayName: "越权" }, { "Content-Type": "application/json" }),
      ctx(id),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("AUTHORIZATION");
  });
});

describe("DELETE /api/skills/[id]", () => {
  it("归档而非删除：200 后仍可 GET 到，status=ARCHIVED", async () => {
    const id = await makeSkill();
    const res = await deleteSkillRoute(req("DELETE"), ctx(id));
    expect(res.status).toBe(200);
    expect((await res.json()).data.message).toBe("Skill 已归档");

    const got = await (await getSkillRoute(req("GET"), ctx(id))).json();
    expect(got.data.status).toBe("ARCHIVED");
  });

  it("目标不存在 → 404", async () => {
    const res = await deleteSkillRoute(req("DELETE"), ctx("ghost"));
    expect(res.status).toBe(404);
  });

  it("无身份头 → 403", async () => {
    const id = await makeSkill();
    const res = await deleteSkillRoute(
      req("DELETE", undefined, { "Content-Type": "application/json" }),
      ctx(id),
    );
    expect(res.status).toBe(403);
  });
});
