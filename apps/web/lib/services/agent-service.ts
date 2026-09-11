import {
  prisma,
  Prisma,
  type AgentStatus,
  type SearchStrategy,
  type PromptConfig,
  type KnowledgeConfig,
  type ToolsConfig,
  type RoutingConfig,
  type Release,
  type AgentVersion,
} from "@agent-up/db";
import { getActor } from "@/lib/context";
import { NotFoundError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit-service";
import { computeJsonDiff } from "@/lib/diff";

type Partition = "prompt" | "knowledge" | "tools" | "routing";

interface ListAgentsParams {
  skip: number;
  take: number;
  status?: string;
  productGroupId?: string;
  search?: string;
}

const PRODUCT_GROUP_SELECT = { id: true, name: true, displayName: true } as const;
const SKILL_SNAPSHOT_SELECT = { id: true, name: true, displayName: true } as const;
const CONFIG_INCLUDE = {
  promptConfig: true,
  knowledgeConfig: true,
  toolsConfig: true,
  routingConfig: true,
} as const;
const AGENT_COUNT_INCLUDE = {
  _count: {
    select: { feedbacks: true, releases: true, versions: true, skillBindings: true },
  },
} as const;

/** 列表契约：无 skillBindings 键（旧 JSON 列表项本就没有） */
const LIST_INCLUDE = {
  productGroup: { select: PRODUCT_GROUP_SELECT },
  ...CONFIG_INCLUDE,
  ...AGENT_COUNT_INCLUDE,
} as const;

/** 详情契约：含 skillBindings，skill 摘要实时 include（替代 JSON 时代嵌入快照） */
const AGENT_INCLUDE = {
  ...LIST_INCLUDE,
  skillBindings: { include: { skill: { select: SKILL_SNAPSHOT_SELECT } } },
} as const;

type AgentRow = Prisma.AgentGetPayload<{ include: typeof AGENT_INCLUDE }>;
type AgentListRow = Prisma.AgentGetPayload<{ include: typeof LIST_INCLUDE }>;
type BindingRow = AgentRow["skillBindings"][number];

function toBindingResponse(row: BindingRow) {
  return {
    id: row.id,
    agentId: row.agentId,
    skillId: row.skillId,
    config: row.config ?? null,
    enabled: row.enabled,
    priority: row.priority,
    boundBy: row.boundBy,
    createdAt: row.boundAt.toISOString(),
    skill: row.skill,
  };
}

function toPromptConfigResponse(row: PromptConfig) {
  return {
    systemPrompt: row.systemPrompt,
    roleDefinition: row.roleDefinition,
    constraints: [...row.constraints],
    outputFormat: row.outputFormat,
    version: row.version,
    lastModifiedAt: row.lastModifiedAt.toISOString(),
  };
}

function toKnowledgeConfigResponse(row: KnowledgeConfig) {
  return {
    wikiVaultId: row.wikiVaultId,
    searchStrategy: row.searchStrategy,
    fallbackToMcp: row.fallbackToMcp,
    maxWikiResults: row.maxWikiResults,
    confidenceThreshold: row.confidenceThreshold,
    version: row.version,
    lastModifiedAt: row.lastModifiedAt.toISOString(),
  };
}

function toToolsConfigResponse(row: ToolsConfig) {
  return {
    mcpTools: row.mcpTools,
    wikiQueryTools: row.wikiQueryTools,
    maxConcurrentCalls: row.maxConcurrentCalls,
    timeoutMs: row.timeoutMs,
    retryCount: row.retryCount,
    version: row.version,
    lastModifiedAt: row.lastModifiedAt.toISOString(),
  };
}

function toRoutingConfigResponse(row: RoutingConfig) {
  return {
    rules: row.rules,
    escalationPolicy: row.escalationPolicy ?? null,
    humanThreshold: row.humanThreshold,
    maxConversationTurns: row.maxConversationTurns,
    idleTimeoutMinutes: row.idleTimeoutMinutes,
    version: row.version,
    lastModifiedAt: row.lastModifiedAt.toISOString(),
  };
}

function toAgentResponse(row: AgentRow | AgentListRow) {
  const skillBindings =
    "skillBindings" in row ? row.skillBindings.map(toBindingResponse) : undefined;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    productGroupId: row.productGroupId,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    productGroup: row.productGroup
      ? {
          id: row.productGroup.id,
          name: row.productGroup.name,
          displayName: row.productGroup.displayName,
        }
      : null,
    promptConfig: row.promptConfig ? toPromptConfigResponse(row.promptConfig) : null,
    knowledgeConfig: row.knowledgeConfig
      ? toKnowledgeConfigResponse(row.knowledgeConfig)
      : null,
    toolsConfig: row.toolsConfig ? toToolsConfigResponse(row.toolsConfig) : null,
    routingConfig: row.routingConfig ? toRoutingConfigResponse(row.routingConfig) : null,
    skillBindings,
    _count: { ...row._count },
  };
}

function toReleaseResponse(row: Release) {
  return {
    id: row.id,
    agentId: row.agentId,
    changeNote: row.changeNote,
    changedPartitions: [...row.changedPartitions],
    status: row.status,
    submittedBy: row.submittedBy,
    submittedAt: row.submittedAt.toISOString(),
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    reviewComment: row.reviewComment,
    configSnapshot: row.configSnapshot ?? null,
    aiReview: row.aiReview ?? null,
  };
}

function toVersionResponse(row: AgentVersion) {
  return {
    id: row.id,
    agentId: row.agentId,
    version: row.version,
    major: row.major,
    minor: row.minor,
    patch: row.patch,
    promptSnapshot: row.promptSnapshot,
    knowledgeSnapshot: row.knowledgeSnapshot,
    toolsSnapshot: row.toolsSnapshot,
    routingSnapshot: row.routingSnapshot,
    releaseId: row.releaseId,
    wikiCommitSha: row.wikiCommitSha,
    publishedAt: row.publishedAt.toISOString(),
    publishedBy: row.publishedBy,
    changeNote: row.changeNote,
    effectivenessReport: row.effectivenessReport ?? null,
  };
}

export async function listAgents(params: ListAgentsParams) {
  const where: Prisma.AgentWhereInput = {
    ...(params.status && params.status !== "ALL" && {
      status: params.status as AgentStatus,
    }),
    ...(params.productGroupId && { productGroupId: params.productGroupId }),
    ...(params.search && {
      OR: [
        { name: { contains: params.search, mode: "insensitive" } },
        { description: { contains: params.search, mode: "insensitive" } },
      ],
    }),
  };

  const [rows, total] = await Promise.all([
    prisma.agent.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: params.skip,
      take: params.take,
      include: LIST_INCLUDE,
    }),
    prisma.agent.count({ where }),
  ]);

  return { items: rows.map(toAgentResponse), total };
}

export async function getAgent(id: string) {
  const row = await prisma.agent.findUnique({ where: { id }, include: AGENT_INCLUDE });
  if (!row) return null;

  const [releases, versions] = await Promise.all([
    prisma.release.findMany({
      where: { agentId: id, status: "PENDING" },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    }),
    prisma.agentVersion.findMany({
      where: { agentId: id },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 5,
    }),
  ]);

  return {
    ...toAgentResponse(row),
    releases: releases.map(toReleaseResponse),
    versions: versions.map(toVersionResponse),
  };
}

export async function createAgent(input: {
  name: string;
  description?: string;
  productGroupId: string;
}) {
  const group = await prisma.productGroup.findUnique({
    where: { id: input.productGroupId },
    select: PRODUCT_GROUP_SELECT,
  });
  if (!group) throw new NotFoundError(`产品组 ${input.productGroupId} 不存在`);

  const agent = await prisma.agent.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      productGroupId: input.productGroupId,
      createdBy: getActor().id,
    },
    include: AGENT_INCLUDE,
  });

  recordAudit("agent.create", "agent", agent.id, { name: input.name });
  return toAgentResponse(agent);
}

export async function updateAgent(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
  },
) {
  const existing = await prisma.agent.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError(`Agent ${id} 不存在`);

  const updated = await prisma.agent.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.status !== undefined && { status: input.status as AgentStatus }),
    },
    include: AGENT_INCLUDE,
  });

  recordAudit("agent.update", "agent", id, input);
  return toAgentResponse(updated);
}

export async function deleteAgent(id: string) {
  const existing = await prisma.agent.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError(`Agent ${id} 不存在`);

  const updated = await prisma.agent.update({
    where: { id },
    data: { status: "ARCHIVED" },
    include: AGENT_INCLUDE,
  });

  recordAudit("agent.archive", "agent", id);
  return toAgentResponse(updated);
}

export async function getAgentConfig(agentId: string, partition: Partition) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: CONFIG_INCLUDE,
  });
  if (!agent) throw new NotFoundError(`Agent ${agentId} 不存在`);

  switch (partition) {
    case "prompt":
      return agent.promptConfig ? toPromptConfigResponse(agent.promptConfig) : null;
    case "knowledge":
      return agent.knowledgeConfig ? toKnowledgeConfigResponse(agent.knowledgeConfig) : null;
    case "tools":
      return agent.toolsConfig ? toToolsConfigResponse(agent.toolsConfig) : null;
    case "routing":
      return agent.routingConfig ? toRoutingConfigResponse(agent.routingConfig) : null;
  }
}

/**
 * 分区配置更新：upsert 合并语义对齐旧实现（未传字段保留），version 恒为干净递增 Int。
 * lastModifiedBy 落库但不回显（旧契约无此键）。
 */
async function updateConfigPartition(
  agentId: string,
  partition: Partition,
  data: Record<string, unknown>,
) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true },
  });
  if (!agent) throw new NotFoundError(`Agent ${agentId} 不存在`);

  const actor = getActor();
  const now = new Date();

  switch (partition) {
    case "prompt": {
      const row = await prisma.promptConfig.upsert({
        where: { agentId },
        create: {
          agentId,
          systemPrompt: data.systemPrompt as string,
          ...(data.roleDefinition !== undefined && {
            roleDefinition: data.roleDefinition as string | null,
          }),
          ...(data.constraints !== undefined && { constraints: data.constraints as string[] }),
          ...(data.outputFormat !== undefined && {
            outputFormat: data.outputFormat as string | null,
          }),
          version: 1,
          lastModifiedAt: now,
          lastModifiedBy: actor.id,
        },
        update: {
          ...(data.systemPrompt !== undefined && { systemPrompt: data.systemPrompt as string }),
          ...(data.roleDefinition !== undefined && {
            roleDefinition: data.roleDefinition as string | null,
          }),
          ...(data.constraints !== undefined && { constraints: data.constraints as string[] }),
          ...(data.outputFormat !== undefined && {
            outputFormat: data.outputFormat as string | null,
          }),
          version: { increment: 1 },
          lastModifiedAt: now,
          lastModifiedBy: actor.id,
        },
      });
      await prisma.agent.update({ where: { id: agentId }, data: { updatedAt: now } });
      return toPromptConfigResponse(row);
    }
    case "knowledge": {
      const row = await prisma.knowledgeConfig.upsert({
        where: { agentId },
        create: {
          agentId,
          ...(data.wikiVaultId !== undefined && {
            wikiVaultId: data.wikiVaultId as string | null,
          }),
          ...(data.searchStrategy !== undefined && {
            searchStrategy: data.searchStrategy as SearchStrategy,
          }),
          ...(data.fallbackToMcp !== undefined && {
            fallbackToMcp: data.fallbackToMcp as boolean,
          }),
          ...(data.maxWikiResults !== undefined && {
            maxWikiResults: data.maxWikiResults as number,
          }),
          ...(data.confidenceThreshold !== undefined && {
            confidenceThreshold: data.confidenceThreshold as number,
          }),
          version: 1,
          lastModifiedAt: now,
          lastModifiedBy: actor.id,
        },
        update: {
          ...(data.wikiVaultId !== undefined && {
            wikiVaultId: data.wikiVaultId as string | null,
          }),
          ...(data.searchStrategy !== undefined && {
            searchStrategy: data.searchStrategy as SearchStrategy,
          }),
          ...(data.fallbackToMcp !== undefined && {
            fallbackToMcp: data.fallbackToMcp as boolean,
          }),
          ...(data.maxWikiResults !== undefined && {
            maxWikiResults: data.maxWikiResults as number,
          }),
          ...(data.confidenceThreshold !== undefined && {
            confidenceThreshold: data.confidenceThreshold as number,
          }),
          version: { increment: 1 },
          lastModifiedAt: now,
          lastModifiedBy: actor.id,
        },
      });
      await prisma.agent.update({ where: { id: agentId }, data: { updatedAt: now } });
      return toKnowledgeConfigResponse(row);
    }
    case "tools": {
      const row = await prisma.toolsConfig.upsert({
        where: { agentId },
        create: {
          agentId,
          mcpTools: (data.mcpTools ?? []) as Prisma.InputJsonValue,
          wikiQueryTools: (data.wikiQueryTools ?? []) as Prisma.InputJsonValue,
          ...(data.maxConcurrentCalls !== undefined && {
            maxConcurrentCalls: data.maxConcurrentCalls as number,
          }),
          ...(data.timeoutMs !== undefined && { timeoutMs: data.timeoutMs as number }),
          ...(data.retryCount !== undefined && { retryCount: data.retryCount as number }),
          version: 1,
          lastModifiedAt: now,
          lastModifiedBy: actor.id,
        },
        update: {
          ...(data.mcpTools !== undefined && {
            mcpTools: data.mcpTools as Prisma.InputJsonValue,
          }),
          ...(data.wikiQueryTools !== undefined && {
            wikiQueryTools: data.wikiQueryTools as Prisma.InputJsonValue,
          }),
          ...(data.maxConcurrentCalls !== undefined && {
            maxConcurrentCalls: data.maxConcurrentCalls as number,
          }),
          ...(data.timeoutMs !== undefined && { timeoutMs: data.timeoutMs as number }),
          ...(data.retryCount !== undefined && { retryCount: data.retryCount as number }),
          version: { increment: 1 },
          lastModifiedAt: now,
          lastModifiedBy: actor.id,
        },
      });
      await prisma.agent.update({ where: { id: agentId }, data: { updatedAt: now } });
      return toToolsConfigResponse(row);
    }
    case "routing": {
      const row = await prisma.routingConfig.upsert({
        where: { agentId },
        create: {
          agentId,
          rules: (data.rules ?? []) as Prisma.InputJsonValue,
          ...(data.escalationPolicy !== undefined && {
            escalationPolicy:
              data.escalationPolicy === null
                ? Prisma.JsonNull
                : (data.escalationPolicy as Prisma.InputJsonValue),
          }),
          ...(data.humanThreshold !== undefined && {
            humanThreshold: data.humanThreshold as number,
          }),
          ...(data.maxConversationTurns !== undefined && {
            maxConversationTurns: data.maxConversationTurns as number,
          }),
          ...(data.idleTimeoutMinutes !== undefined && {
            idleTimeoutMinutes: data.idleTimeoutMinutes as number,
          }),
          version: 1,
          lastModifiedAt: now,
          lastModifiedBy: actor.id,
        },
        update: {
          ...(data.rules !== undefined && { rules: data.rules as Prisma.InputJsonValue }),
          ...(data.escalationPolicy !== undefined && {
            escalationPolicy:
              data.escalationPolicy === null
                ? Prisma.JsonNull
                : (data.escalationPolicy as Prisma.InputJsonValue),
          }),
          ...(data.humanThreshold !== undefined && {
            humanThreshold: data.humanThreshold as number,
          }),
          ...(data.maxConversationTurns !== undefined && {
            maxConversationTurns: data.maxConversationTurns as number,
          }),
          ...(data.idleTimeoutMinutes !== undefined && {
            idleTimeoutMinutes: data.idleTimeoutMinutes as number,
          }),
          version: { increment: 1 },
          lastModifiedAt: now,
          lastModifiedBy: actor.id,
        },
      });
      await prisma.agent.update({ where: { id: agentId }, data: { updatedAt: now } });
      return toRoutingConfigResponse(row);
    }
  }
}

export async function updatePromptConfig(agentId: string, data: Record<string, unknown>) {
  return updateConfigPartition(agentId, "prompt", data);
}

export async function updateKnowledgeConfig(agentId: string, data: Record<string, unknown>) {
  return updateConfigPartition(agentId, "knowledge", data);
}

export async function updateToolsConfig(agentId: string, data: Record<string, unknown>) {
  return updateConfigPartition(agentId, "tools", data);
}

export async function updateRoutingConfig(agentId: string, data: Record<string, unknown>) {
  return updateConfigPartition(agentId, "routing", data);
}

/**
 * 记录一次配置分区变更（含 diff 明细），落 PG（config-changes 无运行时读者，不做 JSON 镜像）。
 * changedBy 从 actor context 取。
 */
export async function recordConfigChange(
  agentId: string,
  partition: string,
  before: unknown,
  after: unknown,
  changeNote?: string,
) {
  const actor = getActor();
  const diff = computeJsonDiff(before, after);

  const change = await prisma.configChange.create({
    data: {
      agentId,
      partition,
      before: before == null ? Prisma.JsonNull : (before as Prisma.InputJsonValue),
      after: after as Prisma.InputJsonValue,
      diff: diff as Prisma.InputJsonValue,
      changedBy: actor.id,
      changeNote: changeNote ?? null,
    },
  });

  recordAudit("agent.config.update", "agent", agentId, {
    partition,
    changeNote,
    diffSummary: {
      added: Object.keys(diff.added),
      removed: Object.keys(diff.removed),
      changed: Object.keys(diff.changed),
    },
  });

  return {
    id: change.id,
    agentId,
    partition,
    before,
    after,
    diff,
    changedBy: actor.id,
    changeNote: changeNote ?? null,
    createdAt: change.changedAt.toISOString(),
  };
}
