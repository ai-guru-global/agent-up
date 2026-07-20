import { store } from "@/lib/data/store";

type Partition = "prompt" | "knowledge" | "tools" | "routing";

interface ListAgentsParams {
  skip: number;
  take: number;
  status?: string;
  productGroupId?: string;
  search?: string;
}

export async function listAgents(params: ListAgentsParams) {
  const groups = store.readArray<{ id: string; name: string; displayName: string }>("settings", "product-groups.json");

  return store.queryList<Record<string, unknown>>(
    ["agents"],
    {
      ...(params.status && params.status !== "ALL" && {
        status: (a) => a.status === params.status,
      }),
      ...(params.productGroupId && {
        productGroupId: (a) => a.productGroupId === params.productGroupId,
      }),
      ...(params.search && {
        search: (a) => {
          const q = params.search!.toLowerCase();
          return String(a.name ?? "").toLowerCase().includes(q) ||
            String(a.description ?? "").toLowerCase().includes(q);
        },
      }),
    },
    (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
    params.skip,
    params.take,
  );
}

export async function getAgent(id: string) {
  const agent = store.read<Record<string, unknown>>("agents", `${id}.json`);
  if (!agent) return null;

  const releases = store.list<Record<string, unknown>>("releases")
    .filter((r) => r.agentId === id && r.status === "PENDING")
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));

  const versions = store.list<Record<string, unknown>>("versions")
    .filter((v) => v.agentId === id)
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
    .slice(0, 5);

  return { ...agent, releases, versions };
}

export async function createAgent(input: {
  name: string;
  description?: string;
  productGroupId: string;
}) {
  const groups = store.readArray<{ id: string; name: string; displayName: string }>("settings", "product-groups.json");
  const group = groups.find((g) => g.id === input.productGroupId);
  if (!group) throw new Error(`产品组 ${input.productGroupId} 不存在`);

  const id = store.generateId();
  const ts = store.now();
  const agent = {
    id,
    name: input.name,
    description: input.description ?? null,
    productGroupId: input.productGroupId,
    status: "DRAFT",
    createdBy: "system",
    createdAt: ts,
    updatedAt: ts,
    promptConfig: null,
    knowledgeConfig: null,
    toolsConfig: null,
    routingConfig: null,
    skillBindings: [],
    productGroup: { id: group.id, name: group.name, displayName: group.displayName },
    _count: { feedbacks: 0, releases: 0, versions: 0, skillBindings: 0 },
  };

  store.write(agent, "agents", `${id}.json`);
  return agent;
}

export async function updateAgent(id: string, input: {
  name?: string;
  description?: string | null;
  status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
}) {
  const agent = store.read<Record<string, unknown>>("agents", `${id}.json`);
  if (!agent) throw new Error(`Agent ${id} 不存在`);

  const groups = store.readArray<{ id: string; name: string; displayName: string }>("settings", "product-groups.json");
  const group = groups.find((g) => g.id === agent.productGroupId);

  const updated = {
    ...agent,
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.status !== undefined && { status: input.status }),
    updatedAt: store.now(),
    productGroup: group ? { id: group.id, name: group.name, displayName: group.displayName } : agent.productGroup,
  };

  store.write(updated, "agents", `${id}.json`);
  return updated;
}

export async function deleteAgent(id: string) {
  const agent = store.read<Record<string, unknown>>("agents", `${id}.json`);
  if (!agent) throw new Error(`Agent ${id} 不存在`);

  const updated = { ...agent, status: "ARCHIVED", updatedAt: store.now() };
  store.write(updated, "agents", `${id}.json`);
  return updated;
}

export async function getAgentConfig(agentId: string, partition: Partition) {
  const agent = store.read<Record<string, unknown>>("agents", `${agentId}.json`);
  if (!agent) throw new Error(`Agent ${agentId} 不存在`);

  const key = `${partition}Config`;
  return (agent[key] as Record<string, unknown>) ?? null;
}

function updateConfigPartition(agentId: string, partition: Partition, data: Record<string, unknown>) {
  const agent = store.read<Record<string, unknown>>("agents", `${agentId}.json`);
  if (!agent) throw new Error(`Agent ${agentId} 不存在`);

  const key = `${partition}Config`;
  const existing = (agent[key] as Record<string, unknown>) ?? {};
  const updated = {
    ...existing,
    ...data,
    version: (Number(existing.version) || 0) + 1,
    lastModifiedAt: store.now(),
  };

  const updatedAgent = { ...agent, [key]: updated, updatedAt: store.now() };
  store.write(updatedAgent, "agents", `${agentId}.json`);
  return updated;
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

export async function recordConfigChange(
  agentId: string,
  partition: string,
  before: unknown,
  after: unknown,
  changeNote?: string
) {
  const { computeJsonDiff } = await import("@/lib/diff");
  const id = store.generateId();
  const change = {
    id,
    agentId,
    partition,
    before,
    after,
    diff: computeJsonDiff(before, after),
    changedBy: "system",
    changeNote,
    createdAt: store.now(),
  };
  store.write(change, "config-changes", `${id}.json`);
  return change;
}
