import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { submitRelease, reviewRelease } from "@/lib/services/release-service";
import { store } from "@/lib/data/store";
import { NotFoundError, ValidationError, ConflictError } from "@/lib/errors";
import { resetActor } from "@/lib/context";
import { useTempDataDir, restoreDataDir } from "./helpers/mock-store";

const AGENT_ID = "ecs-assistant";

beforeEach(() => {
  resetActor();
  useTempDataDir();
  // 给种子 agent 写入非空配置（种子里已有 promptConfig/knowledgeConfig 等）
});
afterEach(restoreDataDir);

describe("submitRelease", () => {
  it("throws NotFoundError for missing agent", async () => {
    await expect(submitRelease("ghost-agent", "note")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("throws ValidationError when nothing changed vs last version", async () => {
    // 种子 agent 有配置但没有任何 version，所以首次提交应成功；
    // 这里先模拟一个已发布版本（snapshot 与当前配置完全一致），再提交应被拒。
    const agent = store.read<Record<string, unknown>>("agents", `${AGENT_ID}.json`)!;
    store.write(
      {
        id: "v-existing",
        agentId: AGENT_ID,
        version: "0.1.0",
        promptSnapshot: agent.promptConfig,
        knowledgeSnapshot: agent.knowledgeConfig,
        toolsSnapshot: agent.toolsConfig,
        routingSnapshot: agent.routingConfig,
        releaseId: "r-old",
        publishedBy: "system",
        publishedAt: "2026-01-01T00:00:00.000Z",
      },
      "versions",
      "v-existing.json",
    );

    await expect(submitRelease(AGENT_ID, "no-change")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("computes changedPartitions via real diff against last version", async () => {
    // 首次发布（无 version）→ 所有非空配置分区都算变更
    const release = await submitRelease(AGENT_ID, "first release");
    const r = release as Record<string, unknown>;
    expect(r.status).toBe("PENDING");
    expect(Array.isArray(r.changedPartitions)).toBe(true);
    expect((r.changedPartitions as string[]).length).toBeGreaterThan(0);
    expect(r.configSnapshot).not.toBeNull();
    expect(r.submittedBy).toBe("system");
  });

  it("only counts actually-changed partitions after a version exists", async () => {
    // 建一个已发布版本：只含 prompt
    const agent = store.read<Record<string, unknown>>("agents", `${AGENT_ID}.json`)!;
    store.write(
      {
        id: "v0",
        agentId: AGENT_ID,
        version: "0.1.0",
        promptSnapshot: agent.promptConfig,
        knowledgeSnapshot: {}, // 空 → 当前 knowledgeConfig 算变更
        toolsSnapshot: agent.toolsConfig,
        routingSnapshot: agent.routingConfig,
        releaseId: "r0",
        publishedBy: "system",
        publishedAt: "2026-01-01T00:00:00.000Z",
      },
      "versions",
      "v0.json",
    );

    const release = (await submitRelease(AGENT_ID, "knowledge change")) as Record<
      string,
      unknown
    >;
    expect(release.changedPartitions).toEqual(["KNOWLEDGE"]);
  });
});

describe("reviewRelease", () => {
  async function makePendingRelease() {
    return (await submitRelease(AGENT_ID, "for review")) as Record<string, unknown>;
  }

  it("throws NotFoundError for missing release", async () => {
    await expect(reviewRelease("ghost", "APPROVED")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("APPROVED creates a Version with bumped semver", async () => {
    const rel = await makePendingRelease();
    const reviewed = (await reviewRelease(
      String(rel.id),
      "APPROVED",
    )) as Record<string, unknown>;
    expect(reviewed.status).toBe("APPROVED");
    expect(reviewed.approvedBy).toBe("system");
    expect(reviewed.version).toBeTruthy();
    const v = reviewed.version as Record<string, string>;
    expect(v.version).toMatch(/^\d+\.\d+\.\d+$/);
    // 首次发布 = 0.1.0
    expect(v.version).toBe("0.1.0");

    // version 文件确实写入了
    const versions = store.list<Record<string, unknown>>("versions");
    expect(versions.some((x) => x.id === v.id)).toBe(true);
  });

  it("REJECTED does not create a Version", async () => {
    const rel = await makePendingRelease();
    const beforeCount = store.list("versions").length;
    const reviewed = (await reviewRelease(
      String(rel.id),
      "REJECTED",
      "不好",
    )) as Record<string, unknown>;
    expect(reviewed.status).toBe("REJECTED");
    expect(reviewed.version).toBeNull();
    expect(store.list("versions").length).toBe(beforeCount);
  });

  it("CHANGES_REQUESTED requires reviewComment", async () => {
    const rel = await makePendingRelease();
    await expect(
      reviewRelease(String(rel.id), "CHANGES_REQUESTED"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("CHANGES_REQUESTED with comment succeeds, no version", async () => {
    const rel = await makePendingRelease();
    const reviewed = (await reviewRelease(
      String(rel.id),
      "CHANGES_REQUESTED",
      "改一下",
    )) as Record<string, unknown>;
    expect(reviewed.status).toBe("CHANGES_REQUESTED");
    expect(reviewed.version).toBeNull();
  });

  it("re-reviewing an already-processed release throws ConflictError", async () => {
    const rel = await makePendingRelease();
    await reviewRelease(String(rel.id), "APPROVED");
    await expect(reviewRelease(String(rel.id), "APPROVED")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("subsequent approval bumps version (second release = 0.1.x or 0.2.0)", async () => {
    // 第一次发布
    const rel1 = await makePendingRelease();
    await reviewRelease(String(rel1.id), "APPROVED");
    const v1 = store
      .list<Record<string, unknown>>("versions")
      .find((x) => x.agentId === AGENT_ID) as Record<string, unknown>;

    // 改一下 prompt 配置再发第二次
    const agent = store.read<Record<string, unknown>>("agents", `${AGENT_ID}.json`)!;
    const prompt = agent.promptConfig as Record<string, unknown>;
    store.write(
      { ...agent, promptConfig: { ...prompt, systemPrompt: "changed" } },
      "agents",
      `${AGENT_ID}.json`,
    );

    const rel2 = (await submitRelease(AGENT_ID, "second")) as Record<string, unknown>;
    const reviewed2 = (await reviewRelease(
      String(rel2.id),
      "APPROVED",
    )) as Record<string, unknown>;
    const v2ver = (reviewed2.version as Record<string, string>).version;
    // 应大于 v1.version
    expect(v2ver).not.toBe(String(v1.version));
  });
});
