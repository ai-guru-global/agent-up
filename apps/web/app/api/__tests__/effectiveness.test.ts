import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma, Prisma, type ConfigPartition } from "@agent-up/db";
import {
  computeEffectivenessReport,
  getOrComputeEffectivenessReport,
  DEFAULT_WINDOW_DAYS,
  type EffectivenessReport,
} from "@/lib/services/effectiveness-service";
import { GET as listVersions } from "@/app/api/agents/[id]/versions/route";
import { GET as getVersion } from "@/app/api/agents/[id]/versions/[versionId]/route";
import { resetActor } from "@/lib/context";
import { _resetDb } from "@/lib/data/test-db";
import { seedAgent, seedReleaseWithVersion } from "@/lib/__tests__/helpers/seed-db";
import { flushAudit, listAudit } from "@/lib/services/audit-service";

const AGENT_ID = "ecs-assistant";

/**
 * 批4 起版本/反馈事实源在 PG。VersionLike 的 refetch 直接查 PG，
 * 夹具必须落库（AgentVersion 需要 Release FK → 统一走 seedReleaseWithVersion）。
 */
async function seedVersion(id: string, publishedAt: string | Date, semver = "0.1.0") {
  await seedReleaseWithVersion({
    agentId: AGENT_ID,
    versionId: id,
    version: semver,
    changeNote: "seed",
    publishedAt: publishedAt instanceof Date ? publishedAt : new Date(publishedAt),
  });
}

async function seedVersionWithReport(id: string, publishedAt: string, report: EffectivenessReport) {
  await seedVersion(id, publishedAt);
  await prisma.agentVersion.update({
    where: { id },
    data: { effectivenessReport: report as unknown as Prisma.InputJsonValue },
  });
}

async function writeFeedback(f: {
  agentId?: string;
  rating: string;
  severity: string;
  targetPartition: string | null;
  submittedAt: string;
}) {
  await prisma.feedback.create({
    data: {
      agentId: f.agentId ?? AGENT_ID,
      title: "fb",
      content: "fb content",
      rating: f.rating as never,
      severity: f.severity as never,
      targetPartition: f.targetPartition as ConfigPartition | null,
      submittedAt: new Date(f.submittedAt),
      submittedBy: "test",
    },
  });
}

beforeEach(async () => {
  resetActor();
  await _resetDb();
  await seedAgent(AGENT_ID);
});
afterEach(async () => {
  await flushAudit();
});

describe("computeEffectivenessReport (pure)", () => {
  const ver = { id: "v1", agentId: "a1", publishedAt: "2026-01-01T00:00:00.000Z" };

  it("returns zero counts when no feedback in window", () => {
    const r = computeEffectivenessReport(ver, [], { now: new Date("2026-02-01") });
    expect(r.totalFeedbacks).toBe(0);
    expect(r.byRating).toEqual({ POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 });
    expect(r.bySeverity).toEqual({ CRITICAL: 0, MAJOR: 0, MINOR: 0, SUGGESTION: 0 });
    expect(r.byPartition).toEqual({ PROMPT: 0, KNOWLEDGE: 0, TOOLS: 0, ROUTING: 0 });
    expect(r.windowDays).toBe(DEFAULT_WINDOW_DAYS);
    expect(r.versionPublishedAt).toBe(ver.publishedAt);
  });

  it("counts only feedback within [publishedAt, publishedAt + windowDays]", () => {
    const fbs = [
      { agentId: "a1", rating: "POSITIVE", severity: "MINOR", targetPartition: "PROMPT", submittedAt: "2025-12-31T23:59:59.000Z" }, // before
      { agentId: "a1", rating: "NEGATIVE", severity: "MAJOR", targetPartition: "KNOWLEDGE", submittedAt: "2026-01-02T00:00:00.000Z" }, // in
      { agentId: "a1", rating: "NEUTRAL", severity: "CRITICAL", targetPartition: "TOOLS", submittedAt: "2026-01-08T00:00:00.000Z" }, // in (day 7 boundary inclusive)
      { agentId: "a1", rating: "POSITIVE", severity: "SUGGESTION", targetPartition: "ROUTING", submittedAt: "2026-01-09T00:00:00.000Z" }, // after
    ];
    const r = computeEffectivenessReport(ver, fbs, { now: new Date("2026-02-01") });
    expect(r.totalFeedbacks).toBe(2);
    expect(r.byRating).toEqual({ POSITIVE: 0, NEGATIVE: 1, NEUTRAL: 1 });
    expect(r.bySeverity).toEqual({ CRITICAL: 1, MAJOR: 1, MINOR: 0, SUGGESTION: 0 });
    expect(r.byPartition).toEqual({ PROMPT: 0, KNOWLEDGE: 1, TOOLS: 1, ROUTING: 0 });
  });

  it("ignores feedback from other agents", () => {
    const fbs = [
      { agentId: "a1", rating: "POSITIVE", severity: "MINOR", targetPartition: "PROMPT", submittedAt: "2026-01-02" },
      { agentId: "a2", rating: "NEGATIVE", severity: "MAJOR", targetPartition: "KNOWLEDGE", submittedAt: "2026-01-02" },
    ];
    const r = computeEffectivenessReport(ver, fbs, { now: new Date("2026-02-01") });
    expect(r.totalFeedbacks).toBe(1);
  });

  it("handles missing targetPartition gracefully (does not crash, does not count)", () => {
    const fbs = [
      { agentId: "a1", rating: "POSITIVE", severity: "MINOR", targetPartition: null, submittedAt: "2026-01-02" },
    ];
    const r = computeEffectivenessReport(ver, fbs, { now: new Date("2026-02-01") });
    expect(r.totalFeedbacks).toBe(1);
    expect(r.byPartition.PROMPT).toBe(0);
  });
});

describe("getOrComputeEffectivenessReport (lazy fill)", () => {
  it("returns null when version is younger than window", async () => {
    await seedVersion("young", "2026-08-04T00:00:00.000Z");
    const r = await getOrComputeEffectivenessReport(
      { id: "young", agentId: AGENT_ID, publishedAt: "2026-08-04T00:00:00.000Z" },
      { now: new Date("2026-08-05") },
    );
    expect(r).toBeNull();
  });

  it("computes and persists when version is older than window", async () => {
    await seedVersion("old", "2026-07-01T00:00:00.000Z");
    await writeFeedback({ rating: "NEGATIVE", severity: "MAJOR", targetPartition: "PROMPT", submittedAt: "2026-07-03T00:00:00.000Z" });
    await writeFeedback({ rating: "POSITIVE", severity: "MINOR", targetPartition: null, submittedAt: "2026-07-05T00:00:00.000Z" });

    const r = await getOrComputeEffectivenessReport(
      { id: "old", agentId: AGENT_ID, publishedAt: "2026-07-01T00:00:00.000Z" },
      { now: new Date("2026-08-05") },
    );
    expect(r).not.toBeNull();
    expect(r!.totalFeedbacks).toBe(2);
    expect(r!.byRating).toEqual({ POSITIVE: 1, NEGATIVE: 1, NEUTRAL: 0 });

    // 持久化验证
    const onDisk = await prisma.agentVersion.findUnique({ where: { id: "old" } });
    expect(onDisk?.effectivenessReport).toBeDefined();
    expect((onDisk?.effectivenessReport as { totalFeedbacks: number }).totalFeedbacks).toBe(2);
  });

  it("is idempotent: second call returns same report, no new audit", async () => {
    await seedVersion("old2", "2026-07-01T00:00:00.000Z");
    await writeFeedback({ rating: "POSITIVE", severity: "MINOR", targetPartition: null, submittedAt: "2026-07-03" });

    const r1 = await getOrComputeEffectivenessReport(
      { id: "old2", agentId: AGENT_ID, publishedAt: "2026-07-01T00:00:00.000Z" },
      { now: new Date("2026-08-05") },
    );
    const r2 = await getOrComputeEffectivenessReport(
      { id: "old2", agentId: AGENT_ID, publishedAt: "2026-07-01T00:00:00.000Z" },
      { now: new Date("2026-08-05") },
    );

    expect(r1).toEqual(r2);

    // 审计只写一次
    await flushAudit();
    const logs = await listAudit();
    const effLogs = logs.filter((l) => l.action === "version.effectiveness.computed");
    expect(effLogs.length).toBe(1);
  });

  it("returns existing report without recomputing", async () => {
    const existing: EffectivenessReport = {
      totalFeedbacks: 999,
      byRating: { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 },
      bySeverity: { CRITICAL: 0, MAJOR: 0, MINOR: 0, SUGGESTION: 0 },
      byPartition: { PROMPT: 0, KNOWLEDGE: 0, TOOLS: 0, ROUTING: 0 },
      computedAt: "2026-08-01T00:00:00.000Z",
      versionPublishedAt: "2026-07-01T00:00:00.000Z",
      windowDays: 7,
    };
    await seedVersionWithReport("prefilled", "2026-07-01T00:00:00.000Z", existing);
    const r = await getOrComputeEffectivenessReport(
      { id: "prefilled", agentId: AGENT_ID, publishedAt: "2026-07-01T00:00:00.000Z" },
      { now: new Date("2026-08-05") },
    );
    expect(r!.totalFeedbacks).toBe(999); // 用了已存的
  });
});

describe("API: GET /api/agents/[id]/versions (lazy fill integration)", () => {
  // 相对日期：避免硬编码"近期"日期随真实时间推移越过 7 天窗口（时间炸弹）
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

  it("auto-fills effectivenessReport for old versions, leaves new versions without", async () => {
    // 老版本(35 天前发布 → 35 天 > 7 天窗口)
    await seedVersion("old", daysAgo(35));
    await writeFeedback({ rating: "NEGATIVE", severity: "MAJOR", targetPartition: "PROMPT", submittedAt: daysAgo(33).toISOString() });

    // 新版本(刚发布,1 天前,仍在 7 天窗口内)
    await seedVersion("new", daysAgo(1), "0.2.0");

    const res = await listVersions(new NextRequest("http://localhost"), {
      params: Promise.resolve({ id: AGENT_ID }),
    });
    const json = await res.json();
    expect(json.data.items.length).toBe(2);

    const old = json.data.items.find((v: { id: string }) => v.id === "old");
    const newV = json.data.items.find((v: { id: string }) => v.id === "new");
    expect(old.effectivenessReport).toBeDefined();
    expect(old.effectivenessReport.totalFeedbacks).toBe(1);
    // 新版本未到窗口,不返回 report 键(由 getOrCompute 返回 null,我们没塞回去)
    expect(newV.effectivenessReport).toBeUndefined();
  });
});

describe("API: GET /api/agents/[id]/versions/[versionId]", () => {
  it("returns single version with lazy-filled report for old version", async () => {
    await seedVersion("single", "2026-07-01T00:00:00.000Z");
    await writeFeedback({ rating: "POSITIVE", severity: "MINOR", targetPartition: null, submittedAt: "2026-07-03" });

    const res = await getVersion(new NextRequest("http://localhost"), {
      params: Promise.resolve({ id: AGENT_ID, versionId: "single" }),
    });
    const json = await res.json();
    expect(json.data.id).toBe("single");
    expect(json.data.effectivenessReport).toBeDefined();
    expect(json.data.effectivenessReport.totalFeedbacks).toBe(1);
  });

  it("returns 404 for missing version", async () => {
    const res = await getVersion(new NextRequest("http://localhost"), {
      params: Promise.resolve({ id: AGENT_ID, versionId: "ghost" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 422 when version belongs to different agent", async () => {
    await seedAgent("rds-assistant", "RDS 助手");
    await seedReleaseWithVersion({
      agentId: "rds-assistant",
      versionId: "x",
      version: "0.1.0",
      changeNote: "seed",
      publishedAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    const res = await getVersion(new NextRequest("http://localhost"), {
      params: Promise.resolve({ id: AGENT_ID, versionId: "x" }),
    });
    expect(res.status).toBe(422);
  });
});
