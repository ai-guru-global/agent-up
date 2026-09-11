import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  GET as listPermissions,
  POST as createPermission,
} from "@/app/api/settings/permissions/route";
import {
  GET as listGroups,
  POST as createGroup,
} from "@/app/api/settings/product-groups/route";
import { prisma } from "@agent-up/db";
import { flushAudit } from "@/lib/services/audit-service";
import { _resetDb } from "@/lib/data/test-db";
import { seedSettings } from "@/lib/__tests__/helpers/seed-db";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";

const ACTOR_HEADERS = {
  "Content-Type": "application/json",
  "x-actor-id": "u-test",
  "x-actor-name": "tester", // HTTP 头值仅允许 Latin-1
  "x-actor-role": "platform_admin",
};

function makeRequest(method: string, body?: unknown, path = "/api/settings/permissions") {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: ACTOR_HEADERS,
  });
}

beforeEach(async () => {
  await _resetDb();
  await seedSettings();
  useTempDataDir();
});
afterEach(restoreDataDir);

describe("GET /api/settings/permissions", () => {
  it("返回含真实 _count.roles 的权限列表", async () => {
    const res = await listPermissions();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const read = data.find((p: { id: string }) => p.id === "perm-1");
    expect(read).toMatchObject({ resource: "agent", action: "read", _count: { roles: 3 } });
    const approve = data.find((p: { id: string }) => p.id === "perm-4");
    expect(approve._count.roles).toBe(1);
  });
});

describe("POST /api/settings/permissions", () => {
  it("创建权限：201 + 审计", async () => {
    const res = await createPermission(
      makeRequest("POST", { resource: "wiki", action: "write", description: "编辑知识页" })
    );
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({ resource: "wiki", action: "write", description: "编辑知识页", _count: { roles: 0 } });
    await flushAudit();
    expect(
      await prisma.auditLog.findFirstOrThrow({ where: { action: "permission.create" } })
    ).toMatchObject({ resource: "permission" });
  });

  it("resource+action 重复 409", async () => {
    const res = await createPermission(makeRequest("POST", { resource: "agent", action: "read" }));
    expect(res.status).toBe(409);
    const { code } = await res.json();
    expect(code).toBe("CONFLICT");
  });

  it("校验失败 422", async () => {
    const res = await createPermission(makeRequest("POST", { resource: "wiki" }));
    expect(res.status).toBe(422);
  });
});

describe("GET /api/settings/product-groups", () => {
  it("返回含真实 _count 与时间戳的产品组列表", async () => {
    const res = await listGroups();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const ecs = data.find((g: { id: string }) => g.id === "ecs-group");
    expect(ecs).toMatchObject({
      name: "ecs-group",
      displayName: "ECS 产品组",
      _count: { agents: 1, members: 2 },
    });
    expect(typeof ecs.createdAt).toBe("string");
    expect(typeof ecs.updatedAt).toBe("string");
    const rds = data.find((g: { id: string }) => g.id === "rds-group");
    expect(rds._count).toEqual({ agents: 0, members: 0 });
  });
});

describe("POST /api/settings/product-groups", () => {
  it("创建产品组：201 + 审计", async () => {
    const res = await createGroup(
      makeRequest("POST", { name: "slb-group", displayName: "SLB 产品组" }, "/api/settings/product-groups")
    );
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({
      name: "slb-group",
      displayName: "SLB 产品组",
      description: null,
      _count: { agents: 0, members: 0 },
    });
    await flushAudit();
    expect(
      await prisma.auditLog.findFirstOrThrow({ where: { action: "product_group.create" } })
    ).toMatchObject({ resource: "product-group", userName: "tester" });
  });

  it("name 重复 409", async () => {
    const res = await createGroup(
      makeRequest("POST", { name: "ecs-group", displayName: "重复组" }, "/api/settings/product-groups")
    );
    expect(res.status).toBe(409);
  });

  it("校验失败 422", async () => {
    const res = await createGroup(makeRequest("POST", { name: "x" }, "/api/settings/product-groups"));
    expect(res.status).toBe(422);
  });
});
