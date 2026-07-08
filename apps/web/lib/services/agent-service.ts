/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "@agent-up/db";
import type { CreateAgentInput, UpdateAgentInput } from "../schemas";

/** Agent 列表查询参数 */
interface ListAgentsParams {
  skip: number;
  take: number;
  status?: string;
  productGroupId?: string;
  search?: string;
}

/** 获取 Agent 列表（含关联数据） */
export async function listAgents(params: ListAgentsParams) {
  const where: Record<string, unknown> = {};
  if (params.status && params.status !== "ALL") where.status = params.status;
  if (params.productGroupId) where.productGroupId = params.productGroupId;
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { description: { contains: params.search, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.agent.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy: { updatedAt: "desc" },
      include: {
        productGroup: { select: { id: true, name: true, displayName: true } },
        _count: {
          select: {
            feedbacks: true,
            releases: true,
            versions: true,
            skillBindings: true,
          },
        },
      },
    }),
    prisma.agent.count({ where }),
  ]);

  return { items, total };
}

/** 获取单个 Agent 详情（含完整配置） */
export async function getAgent(id: string) {
  return prisma.agent.findUnique({
    where: { id },
    include: {
      productGroup: { select: { id: true, name: true, displayName: true } },
      promptConfig: true,
      knowledgeConfig: true,
      toolsConfig: true,
      routingConfig: true,
      draftConfig: true,
      versions: {
        orderBy: { publishedAt: "desc" },
        take: 5,
        select: {
          id: true,
          version: true,
          publishedAt: true,
          publishedBy: true,
          changeNote: true,
        },
      },
      releases: {
        where: { status: "PENDING" },
        orderBy: { submittedAt: "desc" },
      },
      _count: {
        select: {
          feedbacks: true,
          releases: true,
          versions: true,
          skillBindings: true,
        },
      },
    },
  });
}

/** 创建 Agent */
export async function createAgent(input: CreateAgentInput) {
  // 验证产品组存在
  const group = await prisma.productGroup.findUnique({
    where: { id: input.productGroupId },
  });
  if (!group) {
    throw new Error(`产品组 ${input.productGroupId} 不存在`);
  }

  return prisma.agent.create({
    data: {
      name: input.name,
      description: input.description,
      productGroupId: input.productGroupId,
      status: "DRAFT",
      createdBy: "system", // TODO: 从 auth session 获取
    },
    include: {
      productGroup: { select: { id: true, name: true, displayName: true } },
    },
  });
}

/** 更新 Agent */
export async function updateAgent(id: string, input: UpdateAgentInput) {
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) throw new Error(`Agent ${id} 不存在`);

  return prisma.agent.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.status !== undefined && { status: input.status }),
    },
    include: {
      productGroup: { select: { id: true, name: true, displayName: true } },
    },
  });
}

/** 删除 Agent */
export async function deleteAgent(id: string) {
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) throw new Error(`Agent ${id} 不存在`);

  // 软删除：归档而非物理删除
  return prisma.agent.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });
}

// ============================================================
// 配置分区操作
// ============================================================

type Partition = "prompt" | "knowledge" | "tools" | "routing";

const PARTITION_MODEL: Record<Partition, "promptConfig" | "knowledgeConfig" | "toolsConfig" | "routingConfig"> = {
  prompt: "promptConfig",
  knowledge: "knowledgeConfig",
  tools: "toolsConfig",
  routing: "routingConfig",
};

/** 获取指定分区配置 */
export async function getAgentConfig(agentId: string, partition: Partition) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { [PARTITION_MODEL[partition]]: true } as any,
  });
  if (!agent) throw new Error(`Agent ${agentId} 不存在`);
  return (agent as any)[PARTITION_MODEL[partition]] ?? null;
}

/** 更新 Prompt 分区 */
export async function updatePromptConfig(agentId: string, data: {
  systemPrompt: string;
  roleDefinition?: string | null;
  constraints?: string[];
  outputFormat?: string | null;
}) {
  const existing = await prisma.promptConfig.findUnique({ where: { agentId } });
  if (existing) {
    return prisma.promptConfig.update({
      where: { agentId },
      data: {
        ...data,
        version: { increment: 1 },
        lastModifiedAt: new Date(),
      },
    });
  }
  return prisma.promptConfig.create({
    data: { agentId, ...data },
  });
}

/** 更新 Knowledge 分区 */
export async function updateKnowledgeConfig(agentId: string, data: {
  wikiVaultId?: string | null;
  searchStrategy?: "WIKI_FIRST" | "WIKI_ONLY" | "MCP_FIRST" | "HYBRID";
  fallbackToMcp?: boolean;
  maxWikiResults?: number;
  confidenceThreshold?: number;
}) {
  const existing = await prisma.knowledgeConfig.findUnique({ where: { agentId } });
  if (existing) {
    return prisma.knowledgeConfig.update({
      where: { agentId },
      data: {
        ...data,
        version: { increment: 1 },
        lastModifiedAt: new Date(),
      },
    });
  }
  return prisma.knowledgeConfig.create({
    data: { agentId, ...data },
  });
}

/** 更新 Tools 分区 */
export async function updateToolsConfig(agentId: string, data: {
  mcpTools?: unknown[];
  wikiQueryTools?: unknown[];
  maxConcurrentCalls?: number;
  timeoutMs?: number;
  retryCount?: number;
}) {
  const existing = await prisma.toolsConfig.findUnique({ where: { agentId } });
  if (existing) {
    return prisma.toolsConfig.update({
      where: { agentId },
      data: {
        ...(data.mcpTools !== undefined && { mcpTools: data.mcpTools as any }),
        ...(data.wikiQueryTools !== undefined && { wikiQueryTools: data.wikiQueryTools as any }),
        ...(data.maxConcurrentCalls !== undefined && { maxConcurrentCalls: data.maxConcurrentCalls }),
        ...(data.timeoutMs !== undefined && { timeoutMs: data.timeoutMs }),
        ...(data.retryCount !== undefined && { retryCount: data.retryCount }),
        version: { increment: 1 },
        lastModifiedAt: new Date(),
      },
    });
  }
  return prisma.toolsConfig.create({
    data: {
      agentId,
      mcpTools: (data.mcpTools ?? []) as any,
      wikiQueryTools: (data.wikiQueryTools ?? []) as any,
      ...(data.maxConcurrentCalls !== undefined && { maxConcurrentCalls: data.maxConcurrentCalls }),
      ...(data.timeoutMs !== undefined && { timeoutMs: data.timeoutMs }),
      ...(data.retryCount !== undefined && { retryCount: data.retryCount }),
    },
  });
}

/** 更新 Routing 分区 */
export async function updateRoutingConfig(agentId: string, data: {
  rules?: unknown[];
  escalationPolicy?: unknown;
  humanThreshold?: number;
  maxConversationTurns?: number;
  idleTimeoutMinutes?: number;
}) {
  const existing = await prisma.routingConfig.findUnique({ where: { agentId } });
  if (existing) {
    return prisma.routingConfig.update({
      where: { agentId },
      data: {
        ...(data.rules !== undefined && { rules: data.rules as any }),
        ...(data.escalationPolicy !== undefined && { escalationPolicy: data.escalationPolicy as any }),
        ...(data.humanThreshold !== undefined && { humanThreshold: data.humanThreshold }),
        ...(data.maxConversationTurns !== undefined && { maxConversationTurns: data.maxConversationTurns }),
        ...(data.idleTimeoutMinutes !== undefined && { idleTimeoutMinutes: data.idleTimeoutMinutes }),
        version: { increment: 1 },
        lastModifiedAt: new Date(),
      },
    });
  }
  return prisma.routingConfig.create({
    data: {
      agentId,
      rules: (data.rules ?? []) as any,
      ...(data.escalationPolicy !== undefined && { escalationPolicy: data.escalationPolicy as any }),
      ...(data.humanThreshold !== undefined && { humanThreshold: data.humanThreshold }),
      ...(data.maxConversationTurns !== undefined && { maxConversationTurns: data.maxConversationTurns }),
      ...(data.idleTimeoutMinutes !== undefined && { idleTimeoutMinutes: data.idleTimeoutMinutes }),
    },
  });
}

/** 记录配置变更 */
export async function recordConfigChange(
  agentId: string,
  partition: "PROMPT" | "KNOWLEDGE" | "TOOLS" | "ROUTING",
  before: unknown,
  after: unknown,
  changeNote?: string
) {
  return prisma.configChange.create({
    data: {
      agentId,
      partition,
      before: before as any,
      after: after as any,
      diff: {} as any, // TODO: 实现 JSON diff
      changedBy: "system",
      changeNote,
    },
  });
}
