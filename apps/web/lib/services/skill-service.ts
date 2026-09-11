import { prisma, type SkillCategory, type SkillRuntime, type SkillStatus, type Prisma } from "@agent-up/db";
import { getActor } from "@/lib/context";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit-service";

const SKILL_COUNT_INCLUDE = { _count: { select: { bindings: true, versions: true } } } as const;
const AGENT_SELECT = { id: true, name: true } as const;
const SKILL_SNAPSHOT_SELECT = { id: true, name: true, displayName: true } as const;

type SkillWithCount = Prisma.SkillGetPayload<{ include: typeof SKILL_COUNT_INCLUDE }>;
type BindingWithSkill = Prisma.AgentSkillBindingGetPayload<{
  include: { skill: { select: typeof SKILL_SNAPSHOT_SELECT } };
}>;
type BindingWithAgent = Prisma.AgentSkillBindingGetPayload<{
  include: { skill: { select: typeof SKILL_SNAPSHOT_SELECT }; agent: { select: typeof AGENT_SELECT } };
}>;

function toSkillResponse(row: SkillWithCount) {
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    description: row.description,
    category: row.category,
    triggerPatterns: [...row.triggerPatterns],
    inputSchema: row.inputSchema,
    outputSchema: row.outputSchema,
    runtime: row.runtime,
    endpoint: row.endpoint,
    version: row.version,
    status: row.status,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    downloadCount: row.downloadCount,
    authorId: row.authorId,
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    _count: { bindings: row._count.bindings, versions: row._count.versions },
  };
}

/** JSON 时代的 binding 把 skill 摘要快照进条目；PG 化后改 include 实时取，键名与 boundAt→createdAt 保持旧契约 */
function toBindingResponse(row: BindingWithSkill) {
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

function toBindingWithAgentResponse(row: BindingWithAgent) {
  return {
    ...toBindingResponse(row),
    agent: { id: row.agent.id, name: row.agent.name },
  };
}

export async function listSkills(params: {
  skip: number;
  take: number;
  category?: string;
  status?: string;
  search?: string;
}) {
  const where: Prisma.SkillWhereInput = {
    ...(params.category && params.category !== "ALL" && { category: params.category as SkillCategory }),
    ...(params.status && params.status !== "ALL" && { status: params.status as SkillStatus }),
    ...(params.search && {
      OR: [
        { name: { contains: params.search, mode: "insensitive" } },
        { displayName: { contains: params.search, mode: "insensitive" } },
        { description: { contains: params.search, mode: "insensitive" } },
      ],
    }),
  };
  const [rows, total] = await Promise.all([
    prisma.skill.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: params.skip,
      take: params.take,
      include: SKILL_COUNT_INCLUDE,
    }),
    prisma.skill.count({ where }),
  ]);
  return { items: rows.map(toSkillResponse), total };
}

export async function getSkill(id: string) {
  const skill = await prisma.skill.findUnique({
    where: { id },
    include: {
      bindings: {
        include: { skill: { select: SKILL_SNAPSHOT_SELECT }, agent: { select: AGENT_SELECT } },
        orderBy: [{ priority: "desc" }, { id: "desc" }],
      },
      versions: { orderBy: [{ publishedAt: "desc" }, { id: "desc" }], take: 10 },
      ...SKILL_COUNT_INCLUDE,
    },
  });
  if (!skill) return null;

  return {
    ...toSkillResponse(skill),
    bindings: skill.bindings.map(toBindingWithAgentResponse),
    versions: skill.versions.map((v) => ({
      id: v.id,
      skillId: v.skillId,
      version: v.version,
      changelog: v.changelog ?? null,
      publishedAt: v.publishedAt.toISOString(),
    })),
  };
}

export async function createSkill(data: {
  name: string;
  displayName: string;
  description: string;
  category?: string;
  triggerPatterns?: string[];
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  runtime?: string;
  endpoint?: string;
}) {
  const dup = await prisma.skill.findUnique({ where: { name: data.name }, select: { id: true } });
  if (dup) throw new ConflictError("同名 Skill 已存在");

  const actor = getActor();
  const created = await prisma.skill.create({
    data: {
      name: data.name,
      displayName: data.displayName,
      description: data.description,
      category: (data.category ?? "GENERAL") as SkillCategory,
      triggerPatterns: data.triggerPatterns ?? [],
      inputSchema: (data.inputSchema ?? {}) as never,
      outputSchema: (data.outputSchema ?? {}) as never,
      runtime: (data.runtime ?? "HTTP") as SkillRuntime,
      endpoint: data.endpoint ?? null,
      authorId: actor.id,
      authorName: actor.name,
    },
    include: SKILL_COUNT_INCLUDE,
  });

  recordAudit("skill.create", "skill", created.id, { name: data.name });
  return toSkillResponse(created);
}

export async function updateSkill(id: string, data: Record<string, unknown>) {
  const existing = await prisma.skill.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Skill 不存在");

  const updated = await prisma.skill.update({
    where: { id },
    data: data as Prisma.SkillUpdateInput,
    include: SKILL_COUNT_INCLUDE,
  });
  recordAudit("skill.update", "skill", id, data);
  return toSkillResponse(updated);
}

export async function deleteSkill(id: string) {
  const existing = await prisma.skill.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Skill 不存在");

  const archived = await prisma.skill.update({
    where: { id },
    data: { status: "ARCHIVED" },
    include: SKILL_COUNT_INCLUDE,
  });
  recordAudit("skill.archive", "skill", id);
  return toSkillResponse(archived);
}

export async function bindSkill(
  agentId: string,
  skillId: string,
  config?: Record<string, unknown>
) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: AGENT_SELECT });
  if (!agent) throw new NotFoundError("Agent 不存在");
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    select: SKILL_SNAPSHOT_SELECT,
  });
  if (!skill) throw new NotFoundError("Skill 不存在");

  // 幂等 upsert：重复绑同一 skill 合并 config 并重新启用
  const binding = await prisma.agentSkillBinding.upsert({
    where: { agentId_skillId: { agentId, skillId } },
    update: { enabled: true, ...(config !== undefined && { config: config as never }) },
    create: {
      agentId,
      skillId,
      config: (config ?? null) as never,
      enabled: true,
      priority: 0,
      boundBy: getActor().id,
    },
    include: { skill: { select: SKILL_SNAPSHOT_SELECT } },
  });

  recordAudit("skill.bind", "agent", agentId, { skillId });
  return toBindingResponse(binding);
}

export async function unbindSkill(agentId: string, skillId: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: AGENT_SELECT });
  if (!agent) throw new NotFoundError("Agent 不存在");

  // 旧契约：绑定不存在也静默成功
  await prisma.agentSkillBinding.deleteMany({ where: { agentId, skillId } });
  recordAudit("skill.unbind", "agent", agentId, { skillId });
  return { deleted: true };
}

export async function getAgentSkillBindings(agentId: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { id: true } });
  if (!agent) return [];

  const rows = await prisma.agentSkillBinding.findMany({
    where: { agentId },
    orderBy: [{ priority: "desc" }, { id: "desc" }],
    include: { skill: { select: SKILL_SNAPSHOT_SELECT } },
  });
  return rows.map(toBindingResponse);
}

export async function toggleSkillBinding(agentId: string, skillId: string, enabled: boolean) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: AGENT_SELECT });
  if (!agent) throw new NotFoundError("Agent 不存在");

  const binding = await prisma.agentSkillBinding.findUnique({
    where: { agentId_skillId: { agentId, skillId } },
  });
  if (!binding) throw new NotFoundError("绑定不存在");

  const updated = await prisma.agentSkillBinding.update({
    where: { id: binding.id },
    data: { enabled },
    include: { skill: { select: SKILL_SNAPSHOT_SELECT } },
  });
  return toBindingResponse(updated);
}
