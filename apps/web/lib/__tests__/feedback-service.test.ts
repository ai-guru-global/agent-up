import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createFeedback, updateFeedback } from "@/lib/services/feedback-service";
import { store } from "@/lib/data/store";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { resetActor } from "@/lib/context";
import { useTempDataDir, restoreDataDir } from "./helpers/mock-store";

const AGENT_ID = "ecs-assistant";

beforeEach(() => {
  resetActor();
  useTempDataDir();
});
afterEach(restoreDataDir);

async function seedFeedback(status = "NEW") {
  const fb = await createFeedback({
    agentId: AGENT_ID,
    title: "测试反馈",
    content: "内容",
    rating: "NEGATIVE",
    severity: "MAJOR",
  });
  const id = (fb as Record<string, unknown>).id as string;
  // 直接改状态以测试任意起点
  const full = store.read<Record<string, unknown>>("feedback", `${id}.json`);
  store.write({ ...full, status }, "feedback", `${id}.json`);
  return id;
}

describe("createFeedback", () => {
  it("throws NotFoundError for missing agent", async () => {
    await expect(
      createFeedback({
        agentId: "ghost",
        title: "t",
        content: "c",
        rating: "POSITIVE",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("creates feedback with NEW status + actor", async () => {
    const fb = (await createFeedback({
      agentId: AGENT_ID,
      title: "t",
      content: "c",
      rating: "POSITIVE",
    })) as Record<string, unknown>;
    expect(fb.status).toBe("NEW");
    expect(fb.submittedBy).toBe("system");
    expect(fb.id).toBeTruthy();
  });
});

describe("updateFeedback state machine", () => {
  it("NEW -> TRIAGED allowed", async () => {
    const id = await seedFeedback("NEW");
    const updated = (await updateFeedback(id, { status: "TRIAGED" })) as Record<
      string,
      unknown
    >;
    expect(updated.status).toBe("TRIAGED");
  });

  it("NEW -> RESOLVED rejected (skips states)", async () => {
    const id = await seedFeedback("NEW");
    await expect(
      updateFeedback(id, { status: "RESOLVED" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("full happy path NEW -> ... -> CLOSED", async () => {
    const id = await seedFeedback("NEW");
    await updateFeedback(id, { status: "TRIAGED" });
    await updateFeedback(id, { status: "ASSIGNED", assignedTo: "pm" });
    await updateFeedback(id, { status: "IN_PROGRESS" });
    const resolved = (await updateFeedback(id, {
      status: "RESOLVED",
      resolution: "fixed",
    })) as Record<string, unknown>;
    expect(resolved.resolvedAt).toBeTruthy();
    await updateFeedback(id, { status: "VERIFIED", verificationNote: "ok" });
    const verified = (await updateFeedback(id, {
      status: "VERIFIED",
    })) as Record<string, unknown>;
    // verifiedAt set when entering VERIFIED
    expect(verified.verifiedAt).toBeTruthy();
    await updateFeedback(id, { status: "CLOSED" });
    const closed = (await store.read("feedback", `${id}.json`)) as Record<
      string,
      unknown
    >;
    expect(closed.status).toBe("CLOSED");
  });

  it("CLOSED is terminal (no transitions)", async () => {
    const id = await seedFeedback("CLOSED");
    await expect(updateFeedback(id, { status: "NEW" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("WONTFIX is terminal", async () => {
    const id = await seedFeedback("WONTFIX");
    await expect(
      updateFeedback(id, { status: "IN_PROGRESS" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("same-status update (e.g. only severity) allowed", async () => {
    const id = await seedFeedback("NEW");
    const updated = (await updateFeedback(id, {
      severity: "CRITICAL",
    })) as Record<string, unknown>;
    expect(updated.severity).toBe("CRITICAL");
  });

  it("RESOLVED -> IN_PROGRESS allowed (reopen)", async () => {
    const id = await seedFeedback("RESOLVED");
    const updated = (await updateFeedback(id, {
      status: "IN_PROGRESS",
    })) as Record<string, unknown>;
    expect(updated.status).toBe("IN_PROGRESS");
  });

  it("throws NotFoundError for missing feedback", async () => {
    await expect(
      updateFeedback("ghost", { severity: "MINOR" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
