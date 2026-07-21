import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getAgentConfig,
  updatePromptConfig,
  recordConfigChange,
  getAgent,
} from "@/lib/services/agent-service";
import { store } from "@/lib/data/store";
import { NotFoundError } from "@/lib/errors";
import { resetActor } from "@/lib/context";
import { useTempDataDir, restoreDataDir } from "./helpers/mock-store";

const AGENT_ID = "ecs-assistant";

beforeEach(() => {
  resetActor();
  useTempDataDir();
});
afterEach(restoreDataDir);

describe("getAgentConfig", () => {
  it("returns prompt config for seed agent", async () => {
    const config = (await getAgentConfig(AGENT_ID, "prompt")) as Record<
      string,
      unknown
    > | null;
    expect(config).not.toBeNull();
    expect(config).toHaveProperty("systemPrompt");
  });

  it("throws NotFoundError for missing agent", async () => {
    await expect(getAgentConfig("ghost", "prompt")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("updateConfigPartition versioning", () => {
  it("bumps partition version on update", async () => {
    const before = (await getAgentConfig(AGENT_ID, "prompt")) as Record<
      string,
      unknown
    >;
    const beforeVersion = Number(before.version ?? 0);

    const after = (await updatePromptConfig(AGENT_ID, {
      systemPrompt: "新的提示词",
      roleDefinition: "角色",
      constraints: ["c1"],
      outputFormat: "Markdown",
    })) as Record<string, unknown>;

    expect(Number(after.version)).toBe(beforeVersion + 1);
    expect(after.systemPrompt).toBe("新的提示词");
  });

  it("updates agent.updatedAt", async () => {
    const agentBefore = store.read<Record<string, unknown>>(
      "agents",
      `${AGENT_ID}.json`,
    )!;
    await updatePromptConfig(AGENT_ID, {
      systemPrompt: "x",
      roleDefinition: null,
      constraints: [],
      outputFormat: null,
    });
    const agentAfter = store.read<Record<string, unknown>>(
      "agents",
      `${AGENT_ID}.json`,
    )!;
    expect(
      String(agentAfter.updatedAt).localeCompare(String(agentBefore.updatedAt)),
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("recordConfigChange", () => {
  it("writes a change record with diff + actor", async () => {
    const before = { a: 1, b: 2 };
    const after = { a: 1, b: 3, c: 4 };
    const change = (await recordConfigChange(
      AGENT_ID,
      "PROMPT",
      before,
      after,
      "测试变更",
    )) as Record<string, unknown>;

    expect(change.partition).toBe("PROMPT");
    expect(change.changeNote).toBe("测试变更");
    expect(change.changedBy).toBe("system");
    const diff = change.diff as Record<string, unknown>;
    expect(diff.changed).toHaveProperty("b");
    expect(diff.added).toHaveProperty("c");
    expect(diff.removed).toEqual({});
  });

  it("persists to config-changes collection", async () => {
    await recordConfigChange(AGENT_ID, "KNOWLEDGE", { x: 1 }, { x: 2 });
    const list = store.list<Record<string, unknown>>("config-changes");
    expect(list.some((c) => c.agentId === AGENT_ID)).toBe(true);
  });
});

describe("getAgent", () => {
  it("returns null for missing agent", async () => {
    expect(await getAgent("ghost")).toBeNull();
  });

  it("includes pending releases + recent versions", async () => {
    const agent = (await getAgent(AGENT_ID)) as Record<string, unknown>;
    expect(agent).not.toBeNull();
    expect(Array.isArray(agent.releases)).toBe(true);
    expect(Array.isArray(agent.versions)).toBe(true);
  });
});
