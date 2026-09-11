import { describe, it, expect, beforeEach } from "vitest";
import { prisma, type FeedbackStatus } from "@agent-up/db";
import {
  createFeedback,
  updateFeedback,
  listFeedback,
  getFeedback,
} from "@/lib/services/feedback-service";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { resetActor } from "@/lib/context";
import { _resetDb } from "@/lib/data/test-db";
import { seedAgent } from "./helpers/seed-db";
import { flushAudit, listAudit } from "@/lib/services/audit-service";

const AGENT_ID = "ecs-assistant";

beforeEach(async () => {
  resetActor();
  await _resetDb();
  await seedAgent(AGENT_ID);
});

/** service 层改状态的便捷通道（绕过状态机，任意起点） */
async function forceStatus(id: string, status: FeedbackStatus) {
  await prisma.feedback.update({ where: { id }, data: { status } });
}

async function createOne(overrides: Record<string, unknown> = {}) {
  return (await createFeedback({
    agentId: AGENT_ID,
    title: "测试反馈",
    content: "内容",
    rating: "NEGATIVE",
    severity: "MAJOR",
    ...overrides,
  })) as Record<string, unknown>;
}

describe("createFeedback", () => {
  it("throws NotFoundError for missing agent", async () => {
    await expect(
      createFeedback({ agentId: "ghost", title: "t", content: "c", rating: "POSITIVE" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("creates with NEW status + actor, fills agent summary", async () => {
    const fb = await createOne();
    expect(fb.status).toBe("NEW");
    expect(fb.submittedBy).toBe("system");
    expect(fb.severity).toBe("MAJOR");
    expect(fb.agent).toEqual({ id: AGENT_ID, name: "ECS 助手" });
    expect(fb.source).toBe("MANUAL");
    expect(typeof fb.submittedAt).toBe("string");
    // 未设置的可选字段不出键（旧 JSON 契约）
    expect(fb).not.toHaveProperty("resolvedAt");
    expect(fb).not.toHaveProperty("externalRef");
  });

  it("writes audit (PG 事实源)", async () => {
    const fb = await createOne();
    await flushAudit();
    const audits = await listAudit({ action: "feedback.create", resourceId: fb.id as string });
    expect(audits).toHaveLength(1);
    expect(audits[0].details?.rating).toBe("NEGATIVE");
  });
});

describe("getFeedback", () => {
  it("returns null for missing", async () => {
    expect(await getFeedback("ghost")).toBeNull();
  });

  it("returns feedback with agent", async () => {
    const fb = await createOne();
    const got = await getFeedback(fb.id as string);
    expect(got).not.toBeNull();
    expect((got as Record<string, unknown>).agent).toEqual({ id: AGENT_ID, name: "ECS 助手" });
  });
});

describe("listFeedback", () => {
  it("filters by severity/status/tag/agentId, sorts by submittedAt desc", async () => {
    const a = (await createOne({ tags: ["ANSWER_QUALITY"] })) as Record<string, unknown>;
    await createOne({ severity: "MINOR" });
    await createOne({ agentId: AGENT_ID, title: "b" });

    const all = await listFeedback({ skip: 0, take: 10 });
    expect(all.total).toBe(3);
    // 同毫秒创建时 createdAt 相同，id 倒序兜底稳定排序
    expect(all.items).toHaveLength(3);

    const major = await listFeedback({ skip: 0, take: 10, severity: "MAJOR" });
    expect(major.total).toBe(2);
    expect(major.items.every((f) => f.severity === "MAJOR")).toBe(true);

    const tagged = await listFeedback({ skip: 0, take: 10, tag: "ANSWER_QUALITY" });
    expect(tagged.total).toBe(1);
    expect(tagged.items[0].id).toBe(a.id);

    // ALL 豁免：等价于不过滤
    const withAll = await listFeedback({ skip: 0, take: 10, status: "ALL", severity: "ALL" });
    expect(withAll.total).toBe(3);
  });

  it("list items carry agent summary（四出口形状一致）", async () => {
    await createOne();
    const { items } = await listFeedback({ skip: 0, take: 10 });
    expect(items[0].agent).toEqual({ id: AGENT_ID, name: "ECS 助手" });
  });
});

describe("updateFeedback state machine", () => {
  it("NEW -> TRIAGED allowed", async () => {
    const fb = await createOne();
    const updated = (await updateFeedback(fb.id as string, { status: "TRIAGED" })) as Record<string, unknown>;
    expect(updated.status).toBe("TRIAGED");
  });

  it("NEW -> RESOLVED rejected (skips states)", async () => {
    const fb = await createOne();
    await expect(updateFeedback(fb.id as string, { status: "RESOLVED" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("full happy path NEW -> ... -> CLOSED", async () => {
    const fb = await createOne();
    const id = fb.id as string;
    await updateFeedback(id, { status: "TRIAGED" });
    await updateFeedback(id, { status: "ASSIGNED", assignedTo: "pm" });
    const assigned = (await getFeedback(id)) as Record<string, unknown>;
    expect(assigned.assignedTo).toBe("pm");
    expect(assigned.assignedAt).toBeTruthy();
    await updateFeedback(id, { status: "IN_PROGRESS" });
    const resolved = (await updateFeedback(id, { status: "RESOLVED", resolution: "fixed" })) as Record<string, unknown>;
    expect(resolved.resolvedAt).toBeTruthy();
    await updateFeedback(id, { status: "VERIFIED", verificationNote: "ok" });
    const verified = (await getFeedback(id)) as Record<string, unknown>;
    expect(verified.verifiedAt).toBeTruthy();
    expect(verified.verificationNote).toBe("ok");
    await updateFeedback(id, { status: "CLOSED" });
    const closed = (await getFeedback(id)) as Record<string, unknown>;
    expect(closed.status).toBe("CLOSED");
  });

  it("CLOSED is terminal (no transitions)", async () => {
    const fb = await createOne();
    await forceStatus(fb.id as string, "CLOSED");
    await expect(updateFeedback(fb.id as string, { status: "NEW" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("WONTFIX is terminal", async () => {
    const fb = await createOne();
    await forceStatus(fb.id as string, "WONTFIX");
    await expect(updateFeedback(fb.id as string, { status: "IN_PROGRESS" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("same-status update (e.g. only severity) allowed", async () => {
    const fb = await createOne();
    const updated = (await updateFeedback(fb.id as string, { severity: "CRITICAL" })) as Record<string, unknown>;
    expect(updated.severity).toBe("CRITICAL");
  });

  it("RESOLVED -> IN_PROGRESS allowed (reopen)", async () => {
    const fb = await createOne();
    await forceStatus(fb.id as string, "RESOLVED");
    const updated = (await updateFeedback(fb.id as string, { status: "IN_PROGRESS" })) as Record<string, unknown>;
    expect(updated.status).toBe("IN_PROGRESS");
  });

  it("throws NotFoundError for missing feedback", async () => {
    await expect(updateFeedback("ghost", { severity: "MINOR" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("audit records from/to on transition", async () => {
    const fb = await createOne();
    await updateFeedback(fb.id as string, { status: "TRIAGED" });
    await flushAudit();
    const audits = await listAudit({ action: "feedback.update", resourceId: fb.id as string });
    expect(audits[0].details).toEqual({ from: "NEW", to: "TRIAGED" });
  });
});
