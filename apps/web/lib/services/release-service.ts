import { store } from "@/lib/data/store";
import { getActor } from "@/lib/context";
import { NotFoundError, ValidationError, ConflictError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit-service";
import { computeJsonDiff, type DiffResult } from "@/lib/diff";
import {
  bumpVersion,
  formatVersion,
  type Partition,
  type SemVer,
} from "@/lib/versioning";

type Config = Record<string, unknown> | null;

interface AgentLike {
  id: string;
  promptConfig?: Config;
  knowledgeConfig?: Config;
  toolsConfig?: Config;
  routingConfig?: Config;
}

function withAgentName<T extends Record<string, unknown>>(item: T): T {
  const agent = store.read<{ id: string; name: string }>("agents", `${item.agentId}.json`);
  return { ...item, agent: agent ? { id: agent.id, name: agent.name } : null };
}

/** 取某 agent 最近一次已发布 Version 的四个分区 snapshot，作为 diff 基线。 */
function getLatestVersionSnapshots(agentId: string): {
  prompt: Config;
  knowledge: Config;
  tools: Config;
  routing: Config;
  version: string | null;
} {
  const versions = store
    .list<Record<string, unknown>>("versions")
    .filter((v) => v.agentId === agentId)
    .sort(
      (a, b) =>
        String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")),
    );
  const latest = versions[0];
  if (!latest) {
    return { prompt: null, knowledge: null, tools: null, routing: null, version: null };
  }
  return {
    prompt: (latest.promptSnapshot as Config) ?? null,
    knowledge: (latest.knowledgeSnapshot as Config) ?? null,
    tools: (latest.toolsSnapshot as Config) ?? null,
    routing: (latest.routingSnapshot as Config) ?? null,
    version: String(latest.version),
  };
}

/** 判断单个分区是否有真实变更（与上一已发布版本对比）。 */
function partitionChanged(
  before: Config,
  after: Config,
): boolean {
  if (!before && !after) return false;
  const diff: DiffResult = computeJsonDiff(before ?? {}, after ?? {});
  return (
    Object.keys(diff.added).length > 0 ||
    Object.keys(diff.removed).length > 0 ||
    Object.keys(diff.changed).length > 0
  );
}

/**
 * 提交发布。
 *
 * 关键修复：changedPartitions 不再「配置存在就算改动」，
 * 而是与上一已发布 Version 的 snapshot 做真实 diff。
 * 若四个分区都没变，拒绝提交（避免无意义的 release）。
 * configSnapshot 始终写入（修复种子 rel-001 configSnapshot:null 却 APPROVED 的矛盾）。
 */
export async function submitRelease(agentId: string, changeNote: string) {
  const agent = store.read<AgentLike>("agents", `${agentId}.json`);
  if (!agent) throw new NotFoundError("Agent 不存在");

  const baseline = getLatestVersionSnapshots(agentId);

  const candidates: { key: Partition; before: Config; after: Config }[] = [
    { key: "PROMPT", before: baseline.prompt, after: agent.promptConfig ?? null },
    { key: "KNOWLEDGE", before: baseline.knowledge, after: agent.knowledgeConfig ?? null },
    { key: "TOOLS", before: baseline.tools, after: agent.toolsConfig ?? null },
    { key: "ROUTING", before: baseline.routing, after: agent.routingConfig ?? null },
  ];

  const changedPartitions: Partition[] = candidates
    .filter((c) => partitionChanged(c.before, c.after))
    .map((c) => c.key);

  if (changedPartitions.length === 0) {
    throw new ValidationError("没有任何配置变更，无法提交发布");
  }

  const configSnapshot = {
    prompt: agent.promptConfig ?? null,
    knowledge: agent.knowledgeConfig ?? null,
    tools: agent.toolsConfig ?? null,
    routing: agent.routingConfig ?? null,
    snapshotAt: store.now(),
  };

  const id = store.generateId();
  const ts = store.now();
  const release = {
    id,
    agentId,
    changeNote,
    changedPartitions,
    status: "PENDING" as const,
    submittedBy: getActor().id,
    submittedAt: ts,
    approvedBy: null,
    approvedAt: null,
    reviewComment: null,
    configSnapshot,
    version: null,
  };

  store.write(release, "releases", `${id}.json`);
  recordAudit("release.submit", "release", id, { agentId, changedPartitions });
  return withAgentName(release as Record<string, unknown>);
}

/**
 * 审批发布。
 *
 * 修复：
 * - 已处理的 release 再次审批 → ConflictError（此前是含糊的 Error）
 * - CHANGES_REQUESTED 必须带 reviewComment
 * - APPROVED 才生成 Version；REJECTED/CHANGES_REQUESTED 不生成
 * - 版本号用 bumpVersion 真实 SemVer
 */
export async function reviewRelease(
  releaseId: string,
  action: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED",
  reviewComment?: string,
) {
  const release = store.read<Record<string, unknown>>("releases", `${releaseId}.json`);
  if (!release) throw new NotFoundError("Release 不存在");
  if (release.status !== "PENDING") {
    throw new ConflictError(`该 Release 已处理（当前状态：${release.status}）`);
  }
  if (action === "CHANGES_REQUESTED" && !reviewComment?.trim()) {
    throw new ValidationError("CHANGES_REQUESTED 必须填写审批意见");
  }

  const actor = getActor();
  const ts = store.now();
  const updated: Record<string, unknown> = {
    ...release,
    status: action,
    approvedBy: actor.id,
    approvedAt: action === "APPROVED" ? ts : null,
    reviewComment: reviewComment ?? null,
  };

  if (action === "APPROVED") {
    const version = createVersionFromRelease(release);
    updated.version = {
      id: version.id,
      version: version.version,
      publishedAt: version.publishedAt,
    };
  }

  store.write(updated, "releases", `${releaseId}.json`);

  const auditAction =
    action === "APPROVED"
      ? "release.approve"
      : action === "REJECTED"
        ? "release.reject"
        : "release.changes_requested";
  recordAudit(auditAction, "release", releaseId, {
    agentId: release.agentId,
    reviewComment: reviewComment ?? null,
  });

  return updated;
}

/**
 * 从 release 生成不可变 Version 快照。
 * 版本号由 bumpVersion 基于该 agent 当前最高版本 + 本次 changedPartitions 计算。
 */
function createVersionFromRelease(release: Record<string, unknown>) {
  const agentId = release.agentId as string;
  const changedPartitions = (release.changedPartitions as Partition[]) ?? [];

  const allVersions = store
    .list<Record<string, unknown>>("versions")
    .filter((v) => v.agentId === agentId);

  // 取当前最高版本号（按 major.minor.patch 数值比较，而非只看 minor）
  const currentTop = allVersions
    .map((v) => String(v.version))
    .sort((a, b) => compareSemVer(b, a))[0];

  const next: SemVer = bumpVersion(currentTop, changedPartitions);
  const versionStr = formatVersion(next);

  const ts = store.now();
  const snapshot = (release.configSnapshot ?? {}) as Record<string, unknown>;
  const id = store.generateId();
  const version = {
    id,
    agentId,
    version: versionStr,
    major: next.major,
    minor: next.minor,
    patch: next.patch,
    promptSnapshot: snapshot.prompt ?? {},
    knowledgeSnapshot: snapshot.knowledge ?? {},
    toolsSnapshot: snapshot.tools ?? {},
    routingSnapshot: snapshot.routing ?? {},
    releaseId: release.id,
    publishedBy: getActor().id,
    publishedAt: ts,
    changeNote: release.changeNote,
  };

  store.write(version, "versions", `${id}.json`);
  return version;
}

/** SemVer 字符串比较：a > b 返回正数。非法视为 0.0.0。 */
function compareSemVer(a: string, b: string): number {
  const pa = /^(\d+)\.(\d+)\.(\d+)/.exec(a)?.slice(1).map(Number) ?? [0, 0, 0];
  const pb = /^(\d+)\.(\d+)\.(\d+)/.exec(b)?.slice(1).map(Number) ?? [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

/**
 * 整版本回滚：把 Agent 当前的 4 分区 active config 覆盖为目标 Version 的 snapshot。
 *
 * 行为（与单分区 POST /config/[partition]/rollback 的区别）：
 * - 一次性覆盖 4 个分区，无需先编辑草稿
 * - 创建一个 APPROVED Release（不走 PENDING 审批流，因为回滚是紧急恢复而非新增变更）
 * - 立即由 createVersionFromRelease 派生新 Version（版本号自增），确保历史快照不可变
 * - 写入 audit，action = "agent.rollback"，details 包含 targetVersionId / 4 分区变化量
 *
 * 与分区级回滚的取舍：
 * - 分区级回滚更精细（只回滚坏掉的分区），适合「其它分区配置是好的，只是某个分区坏了」场景
 * - 整版本回滚更稳（保证 4 分区组合与历史完全一致），适合「整个版本出问题，全量回退」场景
 *   例如：Version 0.2.0 整体表现不及预期，回到 0.1.0
 */
export async function createRollbackRelease(agentId: string, targetVersionId: string) {
  const agent = store.read<AgentLike>("agents", `${agentId}.json`);
  if (!agent) throw new NotFoundError("Agent 不存在");

  const target = store.read<Record<string, unknown>>("versions", `${targetVersionId}.json`);
  if (!target) throw new NotFoundError("Version 不存在");
  if (target.agentId !== agentId) {
    throw new ValidationError("该 Version 不属于此 Agent");
  }

  const partitions: Partition[] = ["PROMPT", "KNOWLEDGE", "TOOLS", "ROUTING"];
  const snapshotKey: Record<Partition, string> = {
    PROMPT: "promptSnapshot",
    KNOWLEDGE: "knowledgeSnapshot",
    TOOLS: "toolsSnapshot",
    ROUTING: "routingSnapshot",
  };
  const activeKey: Record<Partition, keyof AgentLike> = {
    PROMPT: "promptConfig",
    KNOWLEDGE: "knowledgeConfig",
    TOOLS: "toolsConfig",
    ROUTING: "routingConfig",
  };

  // 1) 直接覆盖 agent 当前 4 分区为 target 的 snapshot
  const ts = store.now();
  const configSnapshot: Record<string, unknown> = {};
  for (const p of partitions) {
    const raw = (target[snapshotKey[p]] as Record<string, unknown> | null) ?? {};
    const { version: _v, lastModifiedAt: _l, ...payload } = raw;
    void _v; void _l;
    configSnapshot[p.toLowerCase()] = payload;
    (agent as Record<string, unknown>)[activeKey[p]] = payload;
  }
  (agent as Record<string, unknown>).updatedAt = ts;
  store.write(agent as Record<string, unknown>, "agents", `${agentId}.json`);

  // 2) 创建一个 status=APPROVED 的 release（不走审批）
  const actor = getActor();
  const releaseId = store.generateId();
  const release: Record<string, unknown> = {
    id: releaseId,
    agentId,
    changeNote: `回滚到 Version ${String(target.version)}`,
    changedPartitions: partitions,
    status: "APPROVED",
    submittedBy: actor.id,
    submittedAt: ts,
    approvedBy: actor.id,
    approvedAt: ts,
    reviewComment: "回滚操作（紧急恢复，无需审批）",
    configSnapshot: { ...configSnapshot, snapshotAt: ts },
    isRollback: true,
    rollbackFromVersion: String(target.version),
    rollbackToVersionId: target.id,
    version: null,
  };

  // 3) 立即派生新 Version（createVersionFromRelease 会按当前最高版本号自增）
  const newVersion = createVersionFromRelease({
    ...release,
    changeNote: `回滚到 v${String(target.version)}`,
  });
  release.version = {
    id: newVersion.id,
    version: newVersion.version,
    publishedAt: newVersion.publishedAt,
  };

  store.write(release, "releases", `${releaseId}.json`);

  // 4) 审计
  recordAudit("agent.rollback", "agent", agentId, {
    rollbackFromVersion: String(target.version),
    rollbackToVersionId: target.id,
    newVersionId: newVersion.id,
    newVersion: newVersion.version,
    partitions: partitions,
  });

  return {
    release: withAgentName(release),
    version: newVersion,
    restoredFrom: { id: target.id, version: target.version },
  };
}

export async function listReleases(agentId: string, status?: string) {
  let items = store
    .list<Record<string, unknown>>("releases")
    .filter((r) => r.agentId === agentId);

  if (status && status !== "ALL") {
    items = items.filter((r) => r.status === status);
  }

  items.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  return items.map(withAgentName);
}
