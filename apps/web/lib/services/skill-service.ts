/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "@agent-up/db";

interface ListSkillsParams {
  skip: number;
  take: number;
  category?: string;
  status?: string;
  search?: string;
}

export async function listSkills(params: ListSkillsParams) {
  const where: Record<string, unknown> = {};
  if (params.category && params.category !== "ALL") where.category = params.category;
  if (params.status && params.status !== "ALL") where.status = params.status;
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { displayName: { contains: params.search, mode: "insensitive" } },
      { description: { contains: params.search, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.skill.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { bindings: true, versions: true } },
      },
    }),
    prisma.skill.count({ where }),
  ]);

  return { items, total };
}

export async function getSkill(id: string) {
  return prisma.skill.findUnique({
    where: { id },
    include: {
      bindings: {
        include: { agent: { select: { id: true, name: true } } },
      },
      versions: {
        orderBy: { publishedAt: "desc" },
        take: 10,
      },
      _count: { select: { bindings: true, versions: true } },
    },
  });
}

export async function createSkill(data: {
  name: string;
  displayName: string;
  description: string;
  category?: string;
  triggerPatterns?: string[];
  inputSchema?: any;
  outputSchema?: any;
  runtime?: string;
  endpoint?: string;
}) {
  return prisma.skill.create({
    data: {
      name: data.name,
      displayName: data.displayName,
      description: data.description,
      category: (data.category ?? "GENERAL") as any,
      triggerPatterns: data.triggerPatterns ?? [],
      inputSchema: (data.inputSchema ?? {}) as any,
      outputSchema: (data.outputSchema ?? {}) as any,
      runtime: (data.runtime ?? "HTTP") as any,
      endpoint: data.endpoint,
      status: "DRAFT",
      authorId: "system",
      authorName: "System",
    },
  });
}

export async function updateSkill(id: string, data: Record<string, any>) {
  const skill = await prisma.skill.findUnique({ where: { id } });
  if (!skill) throw new Error("Skill 不存在");

  return prisma.skill.update({
    where: { id },
    data: {
      ...(data.displayName !== undefined && { displayName: data.displayName }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.endpoint !== undefined && { endpoint: data.endpoint }),
      ...(data.triggerPatterns !== undefined && { triggerPatterns: data.triggerPatterns }),
      ...(data.inputSchema !== undefined && { inputSchema: data.inputSchema }),
      ...(data.outputSchema !== undefined && { outputSchema: data.outputSchema }),
    },
  });
}

export async function deleteSkill(id: string) {
  return prisma.skill.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });
}

/** 绑定 Skill 到 Agent */
export async function bindSkill(agentId: string, skillId: string, config?: any) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new Error("Agent 不存在");
  const skill = await prisma.skill.findUnique({ where: { id: skillId } });
  if (!skill) throw new Error("Skill 不存在");

  return prisma.agentSkillBinding.upsert({
    where: { agentId_skillId: { agentId, skillId } },
    create: {
      agentId,
      skillId,
      config: (config ?? null) as any,
      enabled: true,
      boundBy: "system",
    },
    update: {
      ...(config !== undefined && { config: config as any }),
      enabled: true,
    },
    include: {
      skill: { select: { id: true, name: true, displayName: true } },
    },
  });
}

/** 解绑 Skill */
export async function unbindSkill(agentId: string, skillId: string) {
  return prisma.agentSkillBinding.delete({
    where: { agentId_skillId: { agentId, skillId } },
  });
}

/** 切换 Skill 启用状态 */
export async function toggleSkillBinding(agentId: string, skillId: string, enabled: boolean) {
  return prisma.agentSkillBinding.update({
    where: { agentId_skillId: { agentId, skillId } },
    data: { enabled },
  });
}
