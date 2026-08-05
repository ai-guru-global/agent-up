import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  computeEffectivenessReport,
  getOrComputeEffectivenessReport,
  DEFAULT_WINDOW_DAYS,
} from "@/lib/services/effectiveness-service";
import { GET as listVersions } from "@/app/api/agents/[id]/versions/route";
import { GET as getVersion } from "@/app/api/agents/[id]/versions/[versionId]/route";
import { store } from "@/lib/data/store";
import { resetActor } from "@/lib/context";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";
import { rmSync, mkdirSync } from "fs";
import { join } from "path";
import { _getDataDir } from "@/lib/data/store";

const AGENT_ID = "ecs-assistant";

interface VersionFixture {
  id: string;
  agentId: string;
  publishedAt: string;
  effectivenessReport?: unknown;
}

interface FeedbackFixture {
  id?: string;
  agentId: string;
  rating: string;
  severity: string;
  targetPartition: string | null;
  submittedAt: string;
  status?: string;
}

function writeVersion(v: VersionFixture) {
  store.write(v as Record<string, unknown>, "versions", `${v.id}.json`);
}

function writeFeedback(f: FeedbackFixture) {
  const id = f.id ?? `fb-${Math.random().toString(36).slice(2, 10)}`;
  store.write(
    { id, ...f } as Record<string, unknown>,
    "feedback",
    `${id}.json`,
  );
}

beforeEach(() => {
  resetActor();
  useTempDataDir();
  // 清空 versions 目录（仅保留 test fixture 自己写）
  const versionsDir = join(_getDataDir(), "versions");
  rmSync(versionsDir, { recursive: true, force: true });
  mkdirSync(versionsDir, { recursive: true });
  // 清空 feedback 目录
  const feedbackDir = join(_getDataDir(), "feedback");
  rmSync(feedbackDir, { recursive: true, force: true });
  mkdirSync(feedbackDir, { recursive: true });
});
afterEach(restoreDataDir);

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
    ] as FeedbackFixture[];
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
    ] as FeedbackFixture[];
    const r = computeEffectivenessReport(ver, fbs, { now: new Date("2026-02-01") });
    expect(r.totalFeedbacks).toBe(1);
  });

  it("handles missing targetPartition gracefully (does not crash, does not count)", () => {
    const fbs = [
      { agentId: "a1", rating: "POSITIVE", severity: "MINOR", targetPartition: null, submittedAt: "2026-01-02" },
    ] as FeedbackFixture[];
    const r = computeEffectivenessReport(ver, fbs, { now: new Date("2026-02-01") });
    expect(r.totalFeedbacks).toBe(1);
    expect(r.byPartition.PROMPT).toBe(0);
  });
});

describe("getOrComputeEffectivenessReport (lazy fill)", () => {
  it("returns null when version is younger than window", () => {
    writeVersion({ id: "young", agentId: AGENT_ID, publishedAt: "2026-08-04T00:00:00.000Z" });
    const v = store.read<VersionFixture>("versions", "young.json")!;
    const r = getOrComputeEffectivenessReport(v, { now: new Date("2026-08-05") });
    expect(r).toBeNull();
  });

  it("computes and persists when version is older than window", () => {
    writeVersion({ id: "old", agentId: AGENT_ID, publishedAt: "2026-07-01T00:00:00.000Z" });
    writeFeedback({ agentId: AGENT_ID, rating: "NEGATIVE", severity: "MAJOR", targetPartition: "PROMPT", submittedAt: "2026-07-03T00:00:00.000Z" });
    writeFeedback({ agentId: AGENT_ID, rating: "POSITIVE", severity: "MINOR", targetPartition: null, submittedAt: "2026-07-05T00:00:00.000Z" });

    const v = store.read<VersionFixture>("versions", "old.json")!;
    const r = getOrComputeEffectivenessReport(v, { now: new Date("2026-08-05") });
    expect(r).not.toBeNull();
    expect(r!.totalFeedbacks).toBe(2);
    expect(r!.byRating).toEqual({ POSITIVE: 1, NEGATIVE: 1, NEUTRAL: 0 });

    // 持久化验证
    const onDisk = store.read<VersionFixture>("versions", "old.json")!;
    expect(onDisk.effectivenessReport).toBeDefined();
    expect((onDisk.effectivenessReport as { totalFeedbacks: number }).totalFeedbacks).toBe(2);
  });

  it("is idempotent: second call returns same report, no new audit", () => {
    writeVersion({ id: "old2", agentId: AGENT_ID, publishedAt: "2026-07-01T00:00:00.000Z" });
    writeFeedback({ agentId: AGENT_ID, rating: "POSITIVE", severity: "MINOR", targetPartition: null, submittedAt: "2026-07-03" });

    const v = store.read<VersionFixture>("versions", "old2.json")!;
    const r1 = getOrComputeEffectivenessReport(v, { now: new Date("2026-08-05") });
    const r2 = getOrComputeEffectivenessReport(v, { now: new Date("2026-08-05") });

    expect(r1).toEqual(r2);

    // 审计只写一次
    const logs = store.readArray<{ action: string }>("settings", "audit-logs.json");
    const effLogs = logs.filter((l) => l.action === "version.effectiveness.computed");
    expect(effLogs.length).toBe(1);
  });

  it("returns existing report without recomputing", () => {
    const existing = {
      totalFeedbacks: 999,
      byRating: { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 },
      bySeverity: { CRITICAL: 0, MAJOR: 0, MINOR: 0, SUGGESTION: 0 },
      byPartition: { PROMPT: 0, KNOWLEDGE: 0, TOOLS: 0, ROUTING: 0 },
      computedAt: "2026-08-01T00:00:00.000Z",
      versionPublishedAt: "2026-07-01T00:00:00.000Z",
      windowDays: 7,
    };
    writeVersion({
      id: "prefilled",
      agentId: AGENT_ID,
      publishedAt: "2026-07-01T00:00:00.000Z",
      effectivenessReport: existing,
    });
    const v = store.read<VersionFixture>("versions", "prefilled.json")!;
    const r = getOrComputeEffectivenessReport(v, { now: new Date("2026-08-05") });
    expect(r!.totalFeedbacks).toBe(999); // 用了已存的
  });
});

describe("API: GET /api/agents/[id]/versions (lazy fill integration)", () => {
  it("auto-fills effectivenessReport for old versions, leaves new versions without", async () => {
    // 老版本(7 月发布,现在 8 月 5 日 → 35 天 > 7 天)
    writeVersion({ id: "old", agentId: AGENT_ID, publishedAt: "2026-07-01T00:00:00.000Z" });
    writeFeedback({ agentId: AGENT_ID, rating: "NEGATIVE", severity: "MAJOR", targetPartition: "PROMPT", submittedAt: "2026-07-03T00:00:00.000Z" });

    // 新版本(刚发布,1 天前)
    writeVersion({ id: "new", agentId: AGENT_ID, publishedAt: "2026-08-04T00:00:00.000Z" });

    const res = await listVersions(new NextRequest("http://localhost"), {
      params: Promise.resolve({ id: AGENT_ID }),
    });
    const json = await res.json();
    expect(json.data.items.length).toBe(2);

    const old = json.data.items.find((v: { id: string }) => v.id === "old");
    const newV = json.data.items.find((v: { id: string }) => v.id === "new");
    expect(old.effectivenessReport).toBeDefined();
    expect(old.effectivenessReport.totalFeedbacks).toBe(1);
    // 新版本未到窗口,不返回 report 字段(由 getOrCompute 返回 null,我们没塞回去)
    expect(newV.effectivenessReport).toBeUndefined();
  });
});

describe("API: GET /api/agents/[id]/versions/[versionId]", () => {
  it("returns single version with lazy-filled report for old version", async () => {
    writeVersion({ id: "single", agentId: AGENT_ID, publishedAt: "2026-07-01T00:00:00.000Z" });
    writeFeedback({ agentId: AGENT_ID, rating: "POSITIVE", severity: "MINOR", targetPartition: null, submittedAt: "2026-07-03" });

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
    writeVersion({ id: "x", agentId: "rds-assistant", publishedAt: "2026-07-01T00:00:00.000Z" });
    const res = await getVersion(new NextRequest("http://localhost"), {
      params: Promise.resolve({ id: AGENT_ID, versionId: "x" }),
    });
    expect(res.status).toBe(422);
  });
});
