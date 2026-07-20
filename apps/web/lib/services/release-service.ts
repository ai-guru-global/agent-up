import { store } from "@/lib/data/store";

function withAgentName<T extends Record<string, unknown>>(item: T): T {
  const agent = store.read<{ id: string; name: string }>("agents", `${item.agentId}.json`);
  return { ...item, agent: agent ? { id: agent.id, name: agent.name } : null };
}

export async function submitRelease(agentId: string, changeNote: string) {
  const agent = store.read<Record<string, unknown>>("agents", `${agentId}.json`);
  if (!agent) throw new Error("Agent 不存在");

  const changedPartitions: string[] = [];
  if (agent.promptConfig) changedPartitions.push("PROMPT");
  if (agent.knowledgeConfig) changedPartitions.push("KNOWLEDGE");
  if (agent.toolsConfig) changedPartitions.push("TOOLS");
  if (agent.routingConfig) changedPartitions.push("ROUTING");

  const configSnapshot = {
    prompt: agent.promptConfig,
    knowledge: agent.knowledgeConfig,
    tools: agent.toolsConfig,
    routing: agent.routingConfig,
    snapshotAt: store.now(),
  };

  const id = store.generateId();
  const ts = store.now();
  const release = {
    id,
    agentId,
    changeNote,
    changedPartitions,
    status: "PENDING",
    submittedBy: "system",
    submittedAt: ts,
    approvedBy: null,
    approvedAt: null,
    reviewComment: null,
    configSnapshot,
    version: null,
  };

  store.write(release, "releases", `${id}.json`);
  return withAgentName(release as Record<string, unknown>);
}

export async function reviewRelease(
  releaseId: string,
  action: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED",
  reviewComment?: string
) {
  const release = store.read<Record<string, unknown>>("releases", `${releaseId}.json`);
  if (!release) throw new Error("Release 不存在");
  if (release.status !== "PENDING") throw new Error("该 Release 已处理");

  const ts = store.now();
  const updated: Record<string, unknown> = {
    ...release,
    status: action,
    approvedBy: "system",
    approvedAt: action === "APPROVED" ? ts : null,
    reviewComment: reviewComment ?? null,
  };

  if (action === "APPROVED") {
    const version = createVersionFromRelease(release);
    updated.version = { id: version.id, version: version.version, publishedAt: version.publishedAt };
  }

  store.write(updated, "releases", `${releaseId}.json`);
  return updated;
}

function createVersionFromRelease(release: Record<string, unknown>) {
  const allVersions = store.list<Record<string, unknown>>("versions")
    .filter((v) => v.agentId === release.agentId)
    .sort((a, b) => Number(b.minor ?? 0) - Number(a.minor ?? 0));

  const nextMinor = (Number(allVersions[0]?.minor) || 0) + 1;
  const versionStr = `0.${nextMinor}.0`;
  const ts = store.now();

  const snapshot = (release.configSnapshot ?? {}) as Record<string, unknown>;
  const id = store.generateId();
  const version = {
    id,
    agentId: release.agentId,
    version: versionStr,
    major: 0,
    minor: nextMinor,
    patch: 0,
    promptSnapshot: snapshot.prompt ?? {},
    knowledgeSnapshot: snapshot.knowledge ?? {},
    toolsSnapshot: snapshot.tools ?? {},
    routingSnapshot: snapshot.routing ?? {},
    releaseId: release.id,
    publishedBy: "system",
    publishedAt: ts,
    changeNote: release.changeNote,
  };

  store.write(version, "versions", `${id}.json`);
  return version;
}

export async function listReleases(agentId: string, status?: string) {
  let items = store.list<Record<string, unknown>>("releases")
    .filter((r) => r.agentId === agentId);

  if (status && status !== "ALL") {
    items = items.filter((r) => r.status === status);
  }

  items.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  return items.map(withAgentName);
}
