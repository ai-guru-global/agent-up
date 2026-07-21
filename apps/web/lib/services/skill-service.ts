import { store } from "@/lib/data/store";
import { getActor } from "@/lib/context";
import { NotFoundError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit-service";

export async function listSkills(params: {
  skip: number;
  take: number;
  category?: string;
  status?: string;
  search?: string;
}) {
  return store.queryList<Record<string, unknown>>(
    ["skills"],
    {
      ...(params.category && params.category !== "ALL" && {
        category: (s) => s.category === params.category,
      }),
      ...(params.status && params.status !== "ALL" && {
        status: (s) => s.status === params.status,
      }),
      ...(params.search && {
        search: (s) => {
          const q = params.search!.toLowerCase();
          return String(s.name ?? "").toLowerCase().includes(q) ||
            String(s.displayName ?? "").toLowerCase().includes(q) ||
            String(s.description ?? "").toLowerCase().includes(q);
        },
      }),
    },
    (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
    params.skip,
    params.take,
  );
}

export async function getSkill(id: string) {
  const skill = store.read<Record<string, unknown>>("skills", `${id}.json`);
  if (!skill) return null;

  const agents = store.list<Record<string, unknown>>("agents");
  const bindings = agents
    .filter((a) => Array.isArray(a.skillBindings))
    .flatMap((a) =>
      (a.skillBindings as Record<string, unknown>[])
        .filter((b) => b.skillId === id)
        .map((b) => ({ ...b, agent: { id: a.id, name: a.name } }))
    );

  const versions = store.list<Record<string, unknown>>("skill-versions")
    .filter((v) => v.skillId === id)
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
    .slice(0, 10);

  return {
    ...skill,
    bindings,
    versions,
    _count: { bindings: bindings.length, versions: versions.length },
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
  const actor = getActor();
  const id = store.generateId();
  const ts = store.now();
  const skill = {
    id,
    name: data.name,
    displayName: data.displayName,
    description: data.description,
    category: data.category ?? "GENERAL",
    triggerPatterns: data.triggerPatterns ?? [],
    inputSchema: data.inputSchema ?? {},
    outputSchema: data.outputSchema ?? {},
    runtime: data.runtime ?? "HTTP",
    endpoint: data.endpoint ?? null,
    version: "1.0.0",
    status: "DRAFT",
    publishedAt: null,
    downloadCount: 0,
    authorId: actor.id,
    authorName: actor.name,
    createdAt: ts,
    updatedAt: ts,
    _count: { bindings: 0, versions: 0 },
  };

  store.write(skill, "skills", `${id}.json`);
  recordAudit("skill.create", "skill", id, { name: data.name });
  return skill;
}

export async function updateSkill(id: string, data: Record<string, unknown>) {
  const skill = store.read<Record<string, unknown>>("skills", `${id}.json`);
  if (!skill) throw new NotFoundError("Skill 不存在");

  const updated = { ...skill, ...data, updatedAt: store.now() };
  store.write(updated, "skills", `${id}.json`);
  recordAudit("skill.update", "skill", id, data);
  return updated;
}

export async function deleteSkill(id: string) {
  const skill = store.read<Record<string, unknown>>("skills", `${id}.json`);
  if (!skill) throw new NotFoundError("Skill 不存在");

  const updated = { ...skill, status: "ARCHIVED", updatedAt: store.now() };
  store.write(updated, "skills", `${id}.json`);
  recordAudit("skill.archive", "skill", id);
  return updated;
}

export async function bindSkill(
  agentId: string,
  skillId: string,
  config?: Record<string, unknown>
) {
  const agent = store.read<Record<string, unknown>>("agents", `${agentId}.json`);
  if (!agent) throw new NotFoundError("Agent 不存在");
  const skill = store.read<Record<string, unknown>>("skills", `${skillId}.json`);
  if (!skill) throw new NotFoundError("Skill 不存在");

  const bindings = (agent.skillBindings ?? []) as Record<string, unknown>[];
  const existing = bindings.find((b) => b.skillId === skillId);
  const ts = store.now();

  let binding: Record<string, unknown>;
  if (existing) {
    binding = { ...existing, ...(config !== undefined && { config }), enabled: true };
    const idx = bindings.indexOf(existing);
    bindings[idx] = binding;
  } else {
    binding = {
      id: store.generateId(),
      agentId,
      skillId,
      config: config ?? null,
      enabled: true,
      priority: 0,
      boundBy: getActor().id,
      createdAt: ts,
      skill: { id: skill.id, name: skill.name, displayName: skill.displayName },
    };
    bindings.push(binding);
  }

  const updated = {
    ...agent,
    skillBindings: bindings,
    updatedAt: ts,
    _count: { ...(agent._count as Record<string, number>), skillBindings: bindings.length },
  };
  store.write(updated, "agents", `${agentId}.json`);
  recordAudit("skill.bind", "agent", agentId, { skillId });
  return binding;
}

export async function unbindSkill(agentId: string, skillId: string) {
  const agent = store.read<Record<string, unknown>>("agents", `${agentId}.json`);
  if (!agent) throw new NotFoundError("Agent 不存在");

  const bindings = ((agent.skillBindings ?? []) as Record<string, unknown>[])
    .filter((b) => b.skillId !== skillId);

  const updated = {
    ...agent,
    skillBindings: bindings,
    updatedAt: store.now(),
    _count: { ...(agent._count as Record<string, number>), skillBindings: bindings.length },
  };
  store.write(updated, "agents", `${agentId}.json`);
  recordAudit("skill.unbind", "agent", agentId, { skillId });
  return { deleted: true };
}

export async function getAgentSkillBindings(agentId: string) {
  const agent = store.read<Record<string, unknown>>("agents", `${agentId}.json`);
  if (!agent) return [];

  const bindings = (agent.skillBindings ?? []) as Record<string, unknown>[];
  return bindings.sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0));
}

export async function toggleSkillBinding(agentId: string, skillId: string, enabled: boolean) {
  const agent = store.read<Record<string, unknown>>("agents", `${agentId}.json`);
  if (!agent) throw new NotFoundError("Agent 不存在");

  const bindings = (agent.skillBindings ?? []) as Record<string, unknown>[];
  const binding = bindings.find((b) => b.skillId === skillId);
  if (!binding) throw new NotFoundError("绑定不存在");

  binding.enabled = enabled;
  store.write({ ...agent, skillBindings: bindings, updatedAt: store.now() }, "agents", `${agentId}.json`);
  return binding;
}
