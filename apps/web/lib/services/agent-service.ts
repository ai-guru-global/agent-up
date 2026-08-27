import { store } from "@/lib/data/store";
import { getActor } from "@/lib/context";
import { NotFoundError, ValidationError } from "@/lib/errors";
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

/**
 * 把 productGroupId 解析成完整的产品组对象。
 * createAgent / updateAgent 都会写入 productGroup，但种子数据与 listAgents / getAgent
 * 都只有 productGroupId，导致列表页的「所属产品组」一栏只能渲染成一个孤零零的占位符。
 * 这里统一补齐，保证四个出口的数据形状一致。
 */
function withProductGroup<T extends Record<string, unknown>>(item: T): T {
  const groups = store.readArray<{ id: string; name: string; displayName: string }>(
    "settings",
    "product-groups.json",
  );
  const group = groups.find((g) => g.id === item.productGroupId);
  return {
    ...item,
    productGroup: group
      ? { id: group.id, name: group.name, displayName: group.displayName }
      : null,
  };
}

export async function listAgents(params: ListAgentsParams) {
  const result = store.queryList<Record<string, unknown>>(
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
  return { ...result, items: result.items.map(withProductGroup) };
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

  return { ...withProductGroup(agent), releases, versions };
}

export async function createAgent(input: {
  name: string;
  description?: string;
  productGroupId: string;
}) {
  const groups = store.readArray<{ id: string; name: string; displayName: string }>("settings", "product-groups.json");
  const group = groups.find((g) => g.id === input.productGroupId);
  if (!group) {
    throw new NotFoundError(`产品组 ${input.productGroupId} 不存在`);
  }

  const actor = getActor();
  const id = store.generateId();
  const ts = store.now();
  const agent = {
    id,
    name: input.name,
    description: input.description ?? null,
    productGroupId: input.productGroupId,
    status: "DRAFT",
    createdBy: actor.id,
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
  recordAudit("agent.create", "agent", id, { name: input.name });
  return agent;
}

export async function updateAgent(id: string, input: {
  name?: string;
  description?: string | null;
  status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
}) {
  const agent = store.read<Record<string, unknown>>("agents", `${id}.json`);
  if (!agent) throw new NotFoundError(`Agent ${id} 不存在`);

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
  recordAudit("agent.update", "agent", id, input);
  return updated;
}

export async function deleteAgent(id: string) {
  const agent = store.read<Record<string, unknown>>("agents", `${id}.json`);
  if (!agent) throw new NotFoundError(`Agent ${id} 不存在`);

  const updated = { ...agent, status: "ARCHIVED", updatedAt: store.now() };
  store.write(updated, "agents", `${id}.json`);
  recordAudit("agent.archive", "agent", id);
  return updated;
}

export async function getAgentConfig(agentId: string, partition: Partition) {
  const agent = store.read<Record<string, unknown>>("agents", `${agentId}.json`);
  if (!agent) throw new NotFoundError(`Agent ${agentId} 不存在`);

  const key = `${partition}Config`;
  return (agent[key] as Record<string, unknown>) ?? null;
}

function updateConfigPartition(agentId: string, partition: Partition, data: Record<string, unknown>) {
  const agent = store.read<Record<string, unknown>>("agents", `${agentId}.json`);
  if (!agent) throw new NotFoundError(`Agent ${agentId} 不存在`);

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

/**
 * 记录一次配置分区变更（含 diff 明细）。
 * 写 data/config-changes/<id>.json，并同步写一条审计日志。
 * changedBy 从 actor context 取，不再硬编码。
 */
export async function recordConfigChange(
  agentId: string,
  partition: string,
  before: unknown,
  after: unknown,
  changeNote?: string
) {
  const actor = getActor();
  const diff = computeJsonDiff(before, after);
  const id = store.generateId();
  const change = {
    id,
    agentId,
    partition,
    before,
    after,
    diff,
    changedBy: actor.id,
    changeNote,
    createdAt: store.now(),
  };
  store.write(change, "config-changes", `${id}.json`);
  recordAudit("agent.config.update", "agent", agentId, {
    partition,
    changeNote,
    diffSummary: {
      added: Object.keys(diff.added),
      removed: Object.keys(diff.removed),
      changed: Object.keys(diff.changed),
    },
  });
  return change;
}
