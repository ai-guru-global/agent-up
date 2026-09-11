import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@agent-up/db";
import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  getAgentConfig,
  updatePromptConfig,
  updateKnowledgeConfig,
  updateToolsConfig,
  updateRoutingConfig,
  recordConfigChange,
} from "@/lib/services/agent-service";
import { NotFoundError } from "@/lib/errors";
import { resetActor } from "@/lib/context";
import { _resetDb } from "@/lib/data/test-db";
import { seedAgent } from "./helpers/seed-db";
import { flushAudit, listAudit } from "@/lib/services/audit-service";

const AGENT_ID = "ecs-assistant";
const GROUP_ID = `${AGENT_ID}-group`;

beforeEach(async () => {
  resetActor();
  await _resetDb();
  await seedAgent(AGENT_ID);
});

/** 种 1 条发布 + 版本行（AgentVersion.releaseId 必填 FK） */
async function seedVersion(
  n: number,
  version: string,
  status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED",
  publishedAt: Date,
) {
  const releaseId = `rel-${n}`;
  await prisma.release.create({
    data: {
      id: releaseId,
      agentId: AGENT_ID,
      changeNote: `变更 ${n}`,
      changedPartitions: ["PROMPT"],
      status,
      submittedBy: "seed",
      submittedAt: publishedAt,
    },
  });
  await prisma.agentVersion.create({
    data: {
      id: `ver-${n}`,
      agentId: AGENT_ID,
      version,
      major: 0,
      minor: n,
      patch: 0,
      promptSnapshot: { systemPrompt: `v${n}` },
      knowledgeSnapshot: {},
      toolsSnapshot: {},
      routingSnapshot: {},
      releaseId,
      publishedAt,
      publishedBy: "seed",
      changeNote: `变更 ${n}`,
    },
  });
}

describe("getAgentConfig", () => {
  it("returns null when partition never configured", async () => {
    expect(await getAgentConfig(AGENT_ID, "prompt")).toBeNull();
  });

  it("throws NotFoundError for missing agent", async () => {
    await expect(getAgentConfig("ghost", "prompt")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("returns mapped fields after update", async () => {
    await updatePromptConfig(AGENT_ID, {
      systemPrompt: "新提示词",
      roleDefinition: "角色",
      constraints: ["c1"],
      outputFormat: "Markdown",
    });
    const config = (await getAgentConfig(AGENT_ID, "prompt")) as Record<
      string,
      unknown
    >;
    expect(config.systemPrompt).toBe("新提示词");
    expect(config.roleDefinition).toBe("角色");
    expect(config.constraints).toEqual(["c1"]);
    expect(config.version).toBe(1);
    expect(typeof config.lastModifiedAt).toBe("string");
    // 内部列不外泄
    expect(config).not.toHaveProperty("lastModifiedBy");
    expect(config).not.toHaveProperty("agentId");
  });
});

describe("updateConfigPartition upsert", () => {
  it("first update creates with version 1, second increments and keeps untouched fields", async () => {
    const first = (await updatePromptConfig(AGENT_ID, {
      systemPrompt: "v1",
      constraints: ["c1"],
    })) as Record<string, unknown>;
    expect(first.version).toBe(1);

    const second = (await updatePromptConfig(AGENT_ID, {
      systemPrompt: "v2",
    })) as Record<string, unknown>;
    expect(second.version).toBe(2);
    expect(second.systemPrompt).toBe("v2");
    expect(second.constraints).toEqual(["c1"]);
  });

  it("knowledge partition maps enum + defaults", async () => {
    const row = (await updateKnowledgeConfig(AGENT_ID, {
      searchStrategy: "HYBRID",
      maxWikiResults: 8,
    })) as Record<string, unknown>;
    expect(row.searchStrategy).toBe("HYBRID");
    expect(row.maxWikiResults).toBe(8);
    expect(row.fallbackToMcp).toBe(true);
    expect(row.confidenceThreshold).toBe(0.6);
    expect(row.wikiVaultId).toBeNull();
  });

  it("tools partition supplies Json defaults on create", async () => {
    const row = (await updateToolsConfig(AGENT_ID, {
      maxConcurrentCalls: 5,
    })) as Record<string, unknown>;
    expect(row.mcpTools).toEqual([]);
    expect(row.wikiQueryTools).toEqual([]);
    expect(row.maxConcurrentCalls).toBe(5);
    expect(row.timeoutMs).toBe(30000);
    expect(row.retryCount).toBe(2);
  });

  it("routing partition accepts null escalationPolicy", async () => {
    const row = (await updateRoutingConfig(AGENT_ID, {
      rules: [{ match: "退款" }],
      escalationPolicy: null,
      humanThreshold: 0.5,
    })) as Record<string, unknown>;
    expect(row.rules).toEqual([{ match: "退款" }]);
    expect(row.escalationPolicy).toBeNull();
    expect(row.humanThreshold).toBe(0.5);
  });

  it("throws NotFoundError for missing agent", async () => {
    await expect(
      updatePromptConfig("ghost", { systemPrompt: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("updateAgent", () => {
  it("updates name/description/status", async () => {
    const updated = (await updateAgent(AGENT_ID, {
      name: "改名后",
      description: "新描述",
      status: "ACTIVE",
    })) as Record<string, unknown>;
    expect(updated.name).toBe("改名后");
    expect(updated.description).toBe("新描述");
    expect(updated.status).toBe("ACTIVE");
    expect(updated.productGroup).toMatchObject({ id: GROUP_ID });
  });

  it("throws NotFoundError for missing agent", async () => {
    await expect(updateAgent("ghost", { name: "x" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("deleteAgent", () => {
  it("archives agent", async () => {
    const archived = (await deleteAgent(AGENT_ID)) as Record<string, unknown>;
    expect(archived.status).toBe("ARCHIVED");
  });

  it("throws NotFoundError for missing agent", async () => {
    await expect(deleteAgent("ghost")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("writes audit log", async () => {
    await deleteAgent(AGENT_ID);
    await flushAudit();
    const logs = await listAudit({ action: "agent.archive", resourceId: AGENT_ID });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});

describe("createAgent", () => {
  it("throws NotFoundError for missing product group", async () => {
    await expect(
      createAgent({ name: "X", productGroupId: "ghost-group" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("creates agent with empty counts and null configs", async () => {
    const agent = (await createAgent({
      name: "新助手",
      productGroupId: GROUP_ID,
    })) as Record<string, unknown>;
    expect(agent.status).toBe("DRAFT");
    expect(agent.createdBy).toBe("system");
    expect(agent.productGroup).toMatchObject({ id: GROUP_ID });
    expect(agent.promptConfig).toBeNull();
    expect(agent.knowledgeConfig).toBeNull();
    expect(agent.toolsConfig).toBeNull();
    expect(agent.routingConfig).toBeNull();
    expect(agent.skillBindings).toEqual([]);
    expect(agent._count).toEqual({
      feedbacks: 0,
      releases: 0,
      versions: 0,
      skillBindings: 0,
    });
    expect(typeof agent.createdAt).toBe("string");

    await flushAudit();
    const logs = await listAudit({ action: "agent.create" });
    expect(logs.some((l) => l.resourceId === agent.id)).toBe(true);
  });
});

describe("listAgents", () => {
  it("returns paginated items with productGroup and real counts", async () => {
    const result = (await listAgents({ skip: 0, take: 10 })) as {
      items: Record<string, unknown>[];
      total: number;
    };
    expect(result.total).toBeGreaterThanOrEqual(1);
    const item = result.items[0];
    expect(item.productGroup).toMatchObject({ id: GROUP_ID });
    expect(item._count).toHaveProperty("feedbacks");
    expect(item._count).toHaveProperty("releases");
    expect(item._count).toHaveProperty("versions");
    expect(item._count).toHaveProperty("skillBindings");
    // 列表契约无 skillBindings 键（JSON 序列化后同样缺失）
    expect(item.skillBindings).toBeUndefined();
  });

  it("filters by status", async () => {
    await updateAgent(AGENT_ID, { status: "ACTIVE" });
    const result = (await listAgents({ skip: 0, take: 10, status: "ACTIVE" })) as {
      items: Record<string, unknown>[];
    };
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.items.every((a) => a.status === "ACTIVE")).toBe(true);
  });

  it("filters by search across name", async () => {
    const result = (await listAgents({ skip: 0, take: 10, search: "ECS" })) as {
      items: Record<string, unknown>[];
      total: number;
    };
    expect(result.items.some((a) => a.id === AGENT_ID)).toBe(true);
  });
});

describe("getAgent", () => {
  it("returns null for missing agent", async () => {
    expect(await getAgent("ghost")).toBeNull();
  });

  it("includes only PENDING releases and live skill bindings", async () => {
    await seedVersion(1, "0.1.0", "PENDING", new Date("2026-01-01T00:00:00Z"));
    await prisma.release.create({
      data: {
        id: "rel-approved",
        agentId: AGENT_ID,
        changeNote: "已审批",
        changedPartitions: ["TOOLS"],
        status: "APPROVED",
        submittedBy: "seed",
        submittedAt: new Date("2026-01-02T00:00:00Z"),
      },
    });
    await prisma.skill.create({
      data: {
        id: "skill-1",
        name: "query-ecs",
        displayName: "查询 ECS",
        description: "d",
        inputSchema: {},
        outputSchema: {},
        authorId: "seed",
        authorName: "seed",
      },
    });
    await prisma.agentSkillBinding.create({
      data: {
        agentId: AGENT_ID,
        skillId: "skill-1",
        boundBy: "seed",
        priority: 3,
      },
    });

    const agent = (await getAgent(AGENT_ID)) as Record<string, unknown>;
    expect(agent).not.toBeNull();
    const releases = agent.releases as Record<string, unknown>[];
    expect(releases.length).toBe(1);
    expect(releases[0].id).toBe("rel-1");
    expect(releases[0].status).toBe("PENDING");
    expect(typeof releases[0].submittedAt).toBe("string");

    const bindings = agent.skillBindings as Record<string, unknown>[];
    expect(bindings.length).toBe(1);
    expect(bindings[0]).toMatchObject({
      skillId: "skill-1",
      priority: 3,
      createdAt: expect.any(String),
    });
    expect((bindings[0].skill as Record<string, unknown>).displayName).toBe("查询 ECS");
  });

  it("truncates versions to latest 5 (known legacy behavior)", async () => {
    for (let i = 1; i <= 6; i++) {
      await seedVersion(
        i,
        `0.${i}.0`,
        "APPROVED",
        new Date(Date.UTC(2026, 0, i)),
      );
    }
    const agent = (await getAgent(AGENT_ID)) as Record<string, unknown>;
    const versions = agent.versions as Record<string, unknown>[];
    expect(versions.length).toBe(5);
    expect(versions[0].id).toBe("ver-6");
    expect(versions[0].version).toBe("0.6.0");
    expect(typeof versions[0].publishedAt).toBe("string");
    expect(versions[0].promptSnapshot).toEqual({ systemPrompt: "v6" });
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
    expect(typeof change.createdAt).toBe("string");
    const diff = change.diff as Record<string, unknown>;
    expect(diff.changed).toHaveProperty("b");
    expect(diff.added).toHaveProperty("c");
    expect(diff.removed).toEqual({});
  });

  it("persists to PG (no JSON mirror)", async () => {
    await recordConfigChange(AGENT_ID, "KNOWLEDGE", { x: 1 }, { x: 2 });
    const count = await prisma.configChange.count({ where: { agentId: AGENT_ID } });
    expect(count).toBe(1);
    const row = await prisma.configChange.findFirst({
      where: { agentId: AGENT_ID },
    });
    expect(row?.partition).toBe("KNOWLEDGE");
  });

  it("persists null before and _ROLLBACK-style partition values", async () => {
    const change = (await recordConfigChange(
      AGENT_ID,
      "PROMPT_ROLLBACK",
      null,
      { a: 1 },
    )) as Record<string, unknown>;
    expect(change.before).toBeNull();
    const row = await prisma.configChange.findFirstOrThrow({
      where: { agentId: AGENT_ID, partition: "PROMPT_ROLLBACK" },
    });
    expect(row.before).toBeNull();
  });
});
