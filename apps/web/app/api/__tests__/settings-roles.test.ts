import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as listRoles, POST as createRole } from "@/app/api/settings/roles/route";
import {
  PUT as updateRole,
  DELETE as deleteRole,
} from "@/app/api/settings/roles/[id]/route";
import { prisma } from "@agent-up/db";
import { flushAudit } from "@/lib/services/audit-service";
import { _resetDb } from "@/lib/data/test-db";
import { seedSettings } from "@/lib/__tests__/helpers/seed-db";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";

const ACTOR_HEADERS = {
  "Content-Type": "application/json",
  "x-actor-id": "u-test",
  "x-actor-name": "tester", // HTTP 头值仅允许 Latin-1，中文姓名走 UI 内置 actor
  "x-actor-role": "platform_admin",
};

function makeRequest(method: string, body?: unknown, path = "/api/settings/roles") {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: ACTOR_HEADERS,
  });
}

/** [id] 路由需要注入 params（Next 16 为 Promise 形态） */
function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(async () => {
  await _resetDb();
  await seedSettings();
  useTempDataDir(); // JSON 镜像落 tmp，避免污染真实 data/
});
afterEach(restoreDataDir);

describe("GET /api/settings/roles", () => {
  it("返回含 permissions 与真实 _count.members 的角色列表", async () => {
    const res = await listRoles();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const admin = data.find((r: { id: string }) => r.id === "role-admin");
    expect(admin).toMatchObject({
      name: "platform_admin",
      displayName: "平台管理员",
      isSystem: true,
      description: "拥有所有权限",
      _count: { members: 1 },
    });
    expect(admin.permissions).toEqual([
      { permission: { id: "perm-1", resource: "agent", action: "read" } },
      { permission: { id: "perm-2", resource: "agent", action: "write" } },
      { permission: { id: "perm-3", resource: "agent", action: "publish" } },
      { permission: { id: "perm-4", resource: "release", action: "approve" } },
      { permission: { id: "perm-5", resource: "settings", action: "admin" } },
    ]);
  });
});

describe("POST /api/settings/roles", () => {
  it("创建角色：201 + 缺省形状 + 审计", async () => {
    const res = await createRole(
      makeRequest("POST", { name: "ops", displayName: "运维角色", description: "运维专用" })
    );
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({
      name: "ops",
      displayName: "运维角色",
      description: "运维专用",
      isSystem: false,
      _count: { members: 0 },
      permissions: [],
    });
    await flushAudit();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "role.create" } });
    expect(audit).toMatchObject({ resource: "role", userName: "tester" });
  });

  it("description 缺省落 null", async () => {
    const res = await createRole(makeRequest("POST", { name: "x", displayName: "X" }));
    const { data } = await res.json();
    expect(data.description).toBeNull();
  });

  it("校验失败 422", async () => {
    const res = await createRole(makeRequest("POST", { name: "" }));
    expect(res.status).toBe(422);
  });
});

describe("PUT /api/settings/roles/[id]", () => {
  it("更新 displayName 与 description", async () => {
    const res = await updateRole(
      makeRequest("PUT", { displayName: "新名", description: null }, "/api/settings/roles/role-custom"),
      routeContext("role-custom")
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toMatchObject({ id: "role-custom", displayName: "新名", description: null });
  });

  it("角色不存在 404", async () => {
    const res = await updateRole(
      makeRequest("PUT", { displayName: "x" }, "/api/settings/roles/role-missing"),
      routeContext("role-missing")
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/settings/roles/[id]", () => {
  it("系统角色 403 且未被删除", async () => {
    const res = await deleteRole(
      makeRequest("DELETE", undefined, "/api/settings/roles/role-admin"),
      routeContext("role-admin")
    );
    expect(res.status).toBe(403);
    expect(await prisma.role.findUnique({ where: { id: "role-admin" } })).not.toBeNull();
  });

  it("非系统角色删除成功 + 审计", async () => {
    const res = await deleteRole(
      makeRequest("DELETE", undefined, "/api/settings/roles/role-custom"),
      routeContext("role-custom")
    );
    expect(res.status).toBe(200);
    expect(await prisma.role.findUnique({ where: { id: "role-custom" } })).toBeNull();
    await flushAudit();
    expect(
      await prisma.auditLog.findFirstOrThrow({ where: { action: "role.delete" } })
    ).toMatchObject({ resourceId: "role-custom" });
  });

  it("角色不存在 404", async () => {
    const res = await deleteRole(
      makeRequest("DELETE", undefined, "/api/settings/roles/role-missing"),
      routeContext("role-missing")
    );
    expect(res.status).toBe(404);
  });
});
