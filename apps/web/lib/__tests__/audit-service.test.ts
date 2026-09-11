import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@agent-up/db";
import {
  recordAudit,
  listAudit,
  flushAudit,
  type AuditLogEntry,
} from "@/lib/services/audit-service";
import { withActor } from "@/lib/context";
import { store } from "@/lib/data/store";
import { _resetDb } from "@/lib/data/test-db";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";

beforeEach(_resetDb);

describe("recordAudit", () => {
  it("署名来自 withActor 上下文，actor.id 落 userId 列", async () => {
    let entry!: AuditLogEntry;
    withActor({ id: "u-42", name: "张三", role: "product_member" }, () => {
      entry = recordAudit("agent.update", "agent", "a1", { k: "v" });
    });
    expect(entry.userName).toBe("张三");
    expect(entry.userRole).toBe("product_member");
    await flushAudit();
    const row = await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
    expect(row).toMatchObject({
      action: "agent.update",
      resource: "agent",
      resourceId: "a1",
      userName: "张三",
      userRole: "product_member",
      userId: "u-42",
    });
  });

  it("无请求上下文时缺省系统署名", async () => {
    const entry = recordAudit("x.y", "z", "1");
    expect(entry.userName).toBe("系统");
    expect(entry.userRole).toBe("platform_admin");
    expect(entry.userId).toBe("system");
    await flushAudit();
    const row = await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
    expect(row.userId).toBe("system");
  });

  it("details 缺省时不写入 details 键，DB 列为 NULL", async () => {
    const entry = recordAudit("a", "b", "c");
    expect("details" in entry).toBe(false);
    await flushAudit();
    const row = await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
    expect(row.details).toBeNull();
  });

  it("fire-and-forget：调用方不 await，flushAudit 后落库", async () => {
    const entry = recordAudit("agent.create", "agent", "a2");
    await flushAudit();
    expect(await prisma.auditLog.count({ where: { id: entry.id } })).toBe(1);
  });

  it("桥接期同步镜像写 audit-logs.json（批5 移除）", async () => {
    useTempDataDir();
    try {
      const entry = recordAudit("mirror.test", "test", "m1");
      const logs = store.readArray<Record<string, unknown>>(
        "settings",
        "audit-logs.json"
      );
      expect(logs.some((l) => l.id === entry.id)).toBe(true);
    } finally {
      restoreDataDir();
    }
  });
});

describe("listAudit", () => {
  beforeEach(async () => {
    await prisma.auditLog.createMany({
      data: [
        { id: "l1", action: "agent.update", resource: "agent", resourceId: "a1", userName: "张三", userRole: "product_member", userId: "u-1", createdAt: new Date("2026-07-14T09:00:00.000Z") },
        { id: "l2", action: "role.create", resource: "role", resourceId: "r1", userName: "管理员", userRole: "platform_admin", createdAt: new Date("2026-07-15T10:00:00.000Z") },
        { id: "l3", action: "agent.update", resource: "agent", resourceId: "a2", userName: "张三", userRole: "product_member", userId: "u-2", createdAt: new Date("2026-07-16T11:00:00.000Z") },
      ],
    });
  });

  it("按 createdAt 倒序，createdAt 为 ISO 字符串", async () => {
    const list = await listAudit();
    expect(list.map((l) => l.id)).toEqual(["l3", "l2", "l1"]);
    expect(typeof list[0].createdAt).toBe("string");
  });

  it("action 过滤", async () => {
    const filtered = await listAudit({ action: "role.create" });
    expect(filtered.map((l) => l.id)).toEqual(["l2"]);
  });

  it("resource + resourceId 组合过滤", async () => {
    const filtered = await listAudit({ resource: "agent", resourceId: "a1" });
    expect(filtered.map((l) => l.id)).toEqual(["l1"]);
  });

  it("user 别名同时匹配 userName 与 userId", async () => {
    expect((await listAudit({ user: "张三" })).map((l) => l.id)).toEqual(["l3", "l1"]);
    expect((await listAudit({ user: "u-2" })).map((l) => l.id)).toEqual(["l3"]);
  });

  it("flushAudit 空集安全", async () => {
    await expect(flushAudit()).resolves.toBeUndefined();
  });
});
