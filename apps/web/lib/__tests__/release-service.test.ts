import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma, Prisma } from "@agent-up/db";
import { submitRelease, reviewRelease } from "@/lib/services/release-service";
import { getAgentConfig, updatePromptConfig } from "@/lib/services/agent-service";
import { NotFoundError, ValidationError, ConflictError } from "@/lib/errors";
import { resetActor } from "@/lib/context";
import { _resetDb } from "@/lib/data/test-db";
import { seedAgent } from "@/lib/__tests__/helpers/seed-db";
import { useTempDataDir, restoreDataDir } from "./helpers/mock-store";

const AGENT_ID = "ecs-assistant";

/** 批4 起版本事实源在 PG：submitRelease 的 diff 基线来自最近已发布 AgentVersion */
async function seedVersion(input: {
  id: string;
  version: string;
  releaseId: string;
  promptSnapshot: unknown;
  knowledgeSnapshot?: unknown;
  toolsSnapshot?: unknown;
  routingSnapshot?: unknown;
  publishedAt?: Date;
}) {
  await prisma.release.create({
    data: {
      id: input.releaseId,
      agentId: AGENT_ID,
      changeNote: "seed",
      changedPartitions: ["PROMPT"],
      status: "APPROVED",
      submittedBy: "seed",
    },
  });
  const [major, minor, patch] = input.version.split(".").map(Number);
  await prisma.agentVersion.create({
    data: {
      id: input.id,
      agentId: AGENT_ID,
      version: input.version,
      major: major ?? 0,
      minor: minor ?? 0,
      patch: patch ?? 0,
      promptSnapshot: input.promptSnapshot as Prisma.InputJsonValue,
      knowledgeSnapshot: (input.knowledgeSnapshot ?? {}) as Prisma.InputJsonValue,
      toolsSnapshot: (input.toolsSnapshot ?? {}) as Prisma.InputJsonValue,
      routingSnapshot: (input.routingSnapshot ?? {}) as Prisma.InputJsonValue,
      releaseId: input.releaseId,
      publishedBy: "seed",
      publishedAt: input.publishedAt ?? new Date("2026-01-01T00:00:00.000Z"),
      changeNote: "seed",
    },
  });
}

beforeEach(async () => {
  resetActor();
  useTempDataDir();
  await _resetDb();
  await seedAgent(AGENT_ID);
  // 种子 prompt + knowledge 两个分区（tools/routing 无行 → after=null，语义同 JSON 空配置）
  await prisma.promptConfig.create({
    data: { agentId: AGENT_ID, systemPrompt: "你是 ECS 助手", constraints: ["不乱答"], version: 1 },
  });
  await prisma.knowledgeConfig.create({
    data: { agentId: AGENT_ID, searchStrategy: "WIKI_FIRST", version: 1 },
  });
});
afterEach(restoreDataDir);

describe("submitRelease", () => {
  it("throws NotFoundError for missing agent", async () => {
    await expect(submitRelease("ghost-agent", "note")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("throws ValidationError when nothing changed vs last version", async () => {
    // 已发布版本的 snapshot 与当前配置完全一致 → 提交应被拒
    const prompt = await getAgentConfig(AGENT_ID, "prompt");
    const knowledge = await getAgentConfig(AGENT_ID, "knowledge");
    await seedVersion({
      id: "v-existing",
      version: "0.1.0",
      releaseId: "r-old",
      promptSnapshot: prompt,
      knowledgeSnapshot: knowledge,
    });

    await expect(submitRelease(AGENT_ID, "no-change")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("computes changedPartitions via real diff against last version", async () => {
    // 首次发布（无 version）→ 所有非空配置分区都算变更
    const release = await submitRelease(AGENT_ID, "first release");
    expect(release.status).toBe("PENDING");
    expect(Array.isArray(release.changedPartitions)).toBe(true);
    expect(release.changedPartitions.length).toBeGreaterThan(0);
    expect(release.configSnapshot).not.toBeNull();
    expect(release.submittedBy).toBe("system");
  });

  it("only counts actually-changed partitions after a version exists", async () => {
    // 建一个已发布版本：prompt 与当前一致，knowledge 为空（当前有配置 → 算变更）
    const prompt = await getAgentConfig(AGENT_ID, "prompt");
    await seedVersion({
      id: "v0",
      version: "0.1.0",
      releaseId: "r0",
      promptSnapshot: prompt,
      knowledgeSnapshot: {},
    });

    const release = await submitRelease(AGENT_ID, "knowledge change");
    expect(release.changedPartitions).toEqual(["KNOWLEDGE"]);
  });
});

describe("reviewRelease", () => {
  async function makePendingRelease() {
    return submitRelease(AGENT_ID, "for review");
  }

  it("throws NotFoundError for missing release", async () => {
    await expect(reviewRelease("ghost", "APPROVED")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("APPROVED creates a Version with bumped semver", async () => {
    const rel = await makePendingRelease();
    const reviewed = await reviewRelease(rel.id, "APPROVED");
    expect(reviewed.status).toBe("APPROVED");
    expect(reviewed.approvedBy).toBe("system");
    expect(reviewed.version).toBeTruthy();
    // 首次发布 = 0.1.0
    expect(reviewed.version?.version).toBe("0.1.0");

    // version 行确实写入了
    const versions = await prisma.agentVersion.findMany({ where: { agentId: AGENT_ID } });
    expect(versions.some((x) => x.id === reviewed.version?.id)).toBe(true);
  });

  it("REJECTED does not create a Version", async () => {
    const rel = await makePendingRelease();
    const beforeCount = await prisma.agentVersion.count({ where: { agentId: AGENT_ID } });
    const reviewed = await reviewRelease(rel.id, "REJECTED", "不好");
    expect(reviewed.status).toBe("REJECTED");
    expect(reviewed.version).toBeNull();
    const afterCount = await prisma.agentVersion.count({ where: { agentId: AGENT_ID } });
    expect(afterCount).toBe(beforeCount);
  });

  it("CHANGES_REQUESTED requires reviewComment", async () => {
    const rel = await makePendingRelease();
    await expect(reviewRelease(rel.id, "CHANGES_REQUESTED")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("CHANGES_REQUESTED with comment succeeds, no version", async () => {
    const rel = await makePendingRelease();
    const reviewed = await reviewRelease(rel.id, "CHANGES_REQUESTED", "改一下");
    expect(reviewed.status).toBe("CHANGES_REQUESTED");
    expect(reviewed.version).toBeNull();
  });

  it("re-reviewing an already-processed release throws ConflictError", async () => {
    const rel = await makePendingRelease();
    await reviewRelease(rel.id, "APPROVED");
    await expect(reviewRelease(rel.id, "APPROVED")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("subsequent approval bumps version", async () => {
    // 第一次发布
    const rel1 = await makePendingRelease();
    const reviewed1 = await reviewRelease(rel1.id, "APPROVED");
    const v1 = reviewed1.version?.version as string;

    // 改一下 prompt 配置再发第二次
    await updatePromptConfig(AGENT_ID, { systemPrompt: "changed" });

    const rel2 = await submitRelease(AGENT_ID, "second");
    expect(rel2.changedPartitions).toContain("PROMPT");
    const reviewed2 = await reviewRelease(rel2.id, "APPROVED");
    const v2ver = reviewed2.version?.version as string;
    // 应大于 v1.version
    expect(v2ver).not.toBe(v1);
  });
});
