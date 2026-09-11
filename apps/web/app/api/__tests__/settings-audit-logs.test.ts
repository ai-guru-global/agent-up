import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as listAuditLogs } from "@/app/api/settings/audit-logs/route";
import { _resetDb } from "@/lib/data/test-db";
import { seedAuditLogs } from "@/lib/__tests__/helpers/seed-db";

function makeRequest(query = "") {
  return new NextRequest(`http://localhost/api/settings/audit-logs${query}`);
}

beforeEach(async () => {
  await _resetDb();
  await seedAuditLogs(); // log-001..log-004，createdAt 递增
});

describe("GET /api/settings/audit-logs", () => {
  it("分页元数据与倒序切片", async () => {
    const res = await listAuditLogs(makeRequest("?page=1&pageSize=2"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.items.map((l: { id: string }) => l.id)).toEqual(["log-004", "log-003"]);
    expect(data.pagination).toEqual({
      page: 1,
      pageSize: 2,
      total: 4,
      totalPages: 2,
      hasMore: true,
    });
  });

  it("第二页", async () => {
    const res = await listAuditLogs(makeRequest("?page=2&pageSize=2"));
    const { data } = await res.json();
    expect(data.items.map((l: { id: string }) => l.id)).toEqual(["log-002", "log-001"]);
    expect(data.pagination.hasMore).toBe(false);
  });

  it("action 过滤", async () => {
    const res = await listAuditLogs(makeRequest("?action=role.create"));
    const { data } = await res.json();
    expect(data.items.map((l: { id: string }) => l.id)).toEqual(["log-002"]);
  });

  it("resource + resourceId 组合过滤", async () => {
    const res = await listAuditLogs(makeRequest("?resource=agent&resourceId=ecs-assistant"));
    const { data } = await res.json();
    expect(data.items.map((l: { id: string }) => l.id)).toEqual(["log-001"]);
  });

  it("userName 参数过滤", async () => {
    const res = await listAuditLogs(makeRequest("?userName=pm-chen"));
    const { data } = await res.json();
    expect(data.items.map((l: { id: string }) => l.id)).toEqual(["log-004", "log-001"]);
  });

  it("userId 别名过滤（兼容契约）", async () => {
    const res = await listAuditLogs(makeRequest("?userId=user-wang"));
    const { data } = await res.json();
    expect(data.items.map((l: { id: string }) => l.id)).toEqual(["log-003"]);
  });

  it("返回条目含 userId 与 ISO createdAt", async () => {
    const res = await listAuditLogs(makeRequest("?pageSize=1"));
    const { data } = await res.json();
    expect(data.items[0]).toMatchObject({ userId: "user-chen" });
    expect(typeof data.items[0].createdAt).toBe("string");
  });
});
