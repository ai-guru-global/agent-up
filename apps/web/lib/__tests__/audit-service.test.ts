import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { recordAudit, listAudit } from "@/lib/services/audit-service";
import { store } from "@/lib/data/store";
import { withActor, resetActor } from "@/lib/context";
import { useTempDataDir, restoreDataDir } from "./helpers/mock-store";

beforeEach(() => {
  resetActor();
  useTempDataDir();
});
afterEach(restoreDataDir);

describe("recordAudit", () => {
  it("appends an entry compatible with seed shape", () => {
    const entry = withActor(
      { id: "u1", name: "张三", role: "product_member" },
      () => recordAudit("agent.update", "agent", "a1", { k: "v" }),
    );

    expect(entry).toMatchObject({
      action: "agent.update",
      resource: "agent",
      resourceId: "a1",
      userName: "张三",
      userRole: "product_member",
    });
    expect(entry.id).toBeTruthy();
    expect(entry.createdAt).toBeTruthy();
    expect(entry.details).toEqual({ k: "v" });
  });

  it("persists to settings/audit-logs.json", () => {
    withActor({ id: "u1", name: "Li", role: "x" }, () =>
      recordAudit("x.y", "z", "1"),
    );
    const all = store.readArray<Record<string, unknown>>("settings", "audit-logs.json");
    // 种子有 5 条 + 新增 1 条
    expect(all.some((e) => e.action === "x.y")).toBe(true);
  });

  it("uses system actor by default", () => {
    const entry = recordAudit("test", "test", "1");
    expect(entry.userName).toBe("系统");
    expect(entry.userRole).toBe("platform_admin");
  });

  it("omits details key when not provided", () => {
    const entry = recordAudit("a", "b", "c");
    expect(entry.details).toBeUndefined();
  });
});

describe("listAudit", () => {
  it("returns entries sorted by createdAt desc", () => {
    const list = listAudit();
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].createdAt.localeCompare(list[i].createdAt)).toBeGreaterThanOrEqual(0);
    }
  });

  it("filters by action", () => {
    withActor({ id: "u", name: "n", role: "r" }, () => {
      recordAudit("special.action", "x", "1");
    });
    const filtered = listAudit({ action: "special.action" });
    expect(filtered.every((e) => e.action === "special.action")).toBe(true);
    expect(filtered.length).toBeGreaterThan(0);
  });

  it("filters by resource + resourceId", () => {
    withActor({ id: "u", name: "n", role: "r" }, () => {
      recordAudit("a", "widget", "w-unique");
    });
    const filtered = listAudit({ resource: "widget", resourceId: "w-unique" });
    expect(filtered.every((e) => e.resource === "widget")).toBe(true);
  });
});
