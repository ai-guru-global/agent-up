import { describe, it, expect, beforeEach } from "vitest";
import { GET as getDashboard } from "@/app/api/dashboard/route";
import { prisma } from "@agent-up/db";
import { _resetDb } from "@/lib/data/test-db";
import { seedAgent } from "@/lib/__tests__/helpers/seed-db";

/**
 * GET /api/dashboard — 工作台概览聚合。
 * 断言响应形状（agents/feedback/releases 三组计数 + recent 5 条带 agent 嵌套）
 * 与 JSON 时代保持一致。
 */

const T = (iso: string) => new Date(iso);

beforeEach(async () => {
  await _resetDb();
});

async function seedOverview() {
  await seedAgent("agent-a", "助手A");
  await seedAgent("agent-b", "助手B");
  await prisma.agent.update({
    where: { id: "agent-a" },
    data: { status: "ACTIVE" },
  });

  await prisma.feedback.createMany({
    data: [
      { id: "fb-1", agentId: "agent-a", title: "最新一条", content: "c", rating: "NEGATIVE", tags: ["ANSWER_QUALITY"], status: "NEW", submittedBy: "cre-wang", submittedAt: T("2026-07-03T09:00:00.000Z") },
      { id: "fb-2", agentId: "agent-a", title: "已解决", content: "c", rating: "POSITIVE", tags: ["ANSWER_QUALITY"], status: "RESOLVED", submittedBy: "cre-wang", submittedAt: T("2026-07-01T09:00:00.000Z") },
      { id: "fb-3", agentId: "agent-a", title: "待处理次新", content: "c", rating: "NEUTRAL", tags: ["INCOMPLETE"], status: "TRIAGED", submittedBy: "cre-wang", submittedAt: T("2026-07-02T09:00:00.000Z") },
    ],
  });

  await prisma.release.createMany({
    data: [
      { id: "rel-p", agentId: "agent-a", changeNote: "待审批变更", changedPartitions: ["PROMPT"], status: "PENDING", submittedBy: "pm-chen", submittedAt: T("2026-07-05T09:00:00.000Z") },
      { id: "rel-app", agentId: "agent-b", changeNote: "已批准变更", changedPartitions: ["TOOLS"], status: "APPROVED", submittedBy: "pm-chen", submittedAt: T("2026-07-04T09:00:00.000Z") },
    ],
  });
}

describe("GET /api/dashboard", () => {
  it("返回三组计数与按 submittedAt 倒序的最近 5 条（含 agent 嵌套）", async () => {
    await seedOverview();

    const res = await getDashboard();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const data = json.data as Record<string, unknown>;
    expect(data.agents).toEqual({ total: 2, active: 1 });
    expect(data.feedback).toEqual({ total: 3, pending: 2 });
    expect(data.releases).toEqual({ pending: 1 });

    const recentFeedback = data.recentFeedback as Array<Record<string, unknown>>;
    expect(recentFeedback.map((f) => f.id)).toEqual(["fb-1", "fb-3", "fb-2"]);
    expect(recentFeedback[0].agent).toEqual({ id: "agent-a", name: "助手A" });
    expect(typeof recentFeedback[0].submittedAt).toBe("string");

    const recentReleases = data.recentReleases as Array<Record<string, unknown>>;
    expect(recentReleases.map((r) => r.id)).toEqual(["rel-p", "rel-app"]);
    expect(recentReleases[1].agent).toEqual({ id: "agent-b", name: "助手B" });
  });

  it("空库：计数全 0，recent 为空数组", async () => {
    const res = await getDashboard();
    const json = await res.json();
    const data = json.data as Record<string, unknown>;
    expect(data.agents).toEqual({ total: 0, active: 0 });
    expect(data.feedback).toEqual({ total: 0, pending: 0 });
    expect(data.releases).toEqual({ pending: 0 });
    expect(data.recentFeedback).toEqual([]);
    expect(data.recentReleases).toEqual([]);
  });

  it("recent 截取最近 5 条，不为更多记录扩容", async () => {
    await seedOverview();
    await prisma.feedback.createMany({
      data: [1, 2, 3, 4].map((i) => ({
        id: `fb-x${i}`,
        agentId: "agent-a",
        title: `第 ${i} 条`,
        content: "c",
        rating: "NEGATIVE",
        tags: ["ANSWER_QUALITY"],
        status: "NEW",
        submittedBy: "cre-wang",
        submittedAt: T(`2026-07-10T0${i}:00:00.000Z`),
      })),
    });

    const res = await getDashboard();
    const json = await res.json();
    const data = json.data as Record<string, unknown>;
    expect((data.recentFeedback as unknown[]).length).toBe(5);
    const ids = (data.recentFeedback as Array<Record<string, unknown>>).map((f) => f.id);
    expect(ids[0]).toBe("fb-x4");
  });
});
