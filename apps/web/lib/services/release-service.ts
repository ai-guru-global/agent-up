import {
  prisma,
  Prisma,
  type AgentVersion,
  type Release,
} from "@agent-up/db";
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
import {
  toPromptConfigResponse,
  toKnowledgeConfigResponse,
  toToolsConfigResponse,
  toRoutingConfigResponse,
  toReleaseResponse,
  toVersionResponse,
  updatePromptConfig,
  updateKnowledgeConfig,
  updateToolsConfig,
  updateRoutingConfig,
} from "@/lib/services/agent-service";

type Config = Record<string, unknown> | null;

export const VALID_RELEASE_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CHANGES_REQUESTED",
] as const;

const AGENT_BRIEF = { select: { id: true, name: true } } as const;

/** release 响应统一加 agent join（reviewRelease 例外，JSON 契约不带） */
function withAgent(row: Release & { agent: { id: string; name: string } }) {
  return { ...toReleaseResponse(row), agent: { id: row.agent.id, name: row.agent.name } };
}

/** 判断单个分区是否有真实变更（与上一已发布版本对比）。 */
function partitionChanged(before: Config, after: Config): boolean {
  if (!before && !after) return false;
  const diff: DiffResult = computeJsonDiff(before ?? {}, after ?? {});
  return (
    Object.keys(diff.added).length > 0 ||
    Object.keys(diff.removed).length > 0 ||
    Object.keys(diff.changed).length > 0
  );
}

/** SemVer 字符串比较：a > b 返回正数。非法视为 0.0.0。 */
export function compareSemVer(a: string, b: string): number {
  const pa = /^(\d+)\.(\d+)\.(\d+)/.exec(a)?.slice(1).map(Number) ?? [0, 0, 0];
  const pb = /^(\d+)\.(\d+)\.(\d+)/.exec(b)?.slice(1).map(Number) ?? [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

/**
 * 提交发布。
 *
 * changedPartitions 与上一已发布 Version 的 snapshot 做真实 diff，
 * 四分区都没变则拒绝提交；configSnapshot 始终写入（含各分区完整 payload）。
 */
export async function submitRelease(agentId: string, changeNote: string) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      promptConfig: true,
      knowledgeConfig: true,
      toolsConfig: true,
      routingConfig: true,
    },
  });
  if (!agent) throw new NotFoundError("Agent 不存在");

  const after = {
    prompt: agent.promptConfig ? toPromptConfigResponse(agent.promptConfig) : null,
    knowledge: agent.knowledgeConfig ? toKnowledgeConfigResponse(agent.knowledgeConfig) : null,
    tools: agent.toolsConfig ? toToolsConfigResponse(agent.toolsConfig) : null,
    routing: agent.routingConfig ? toRoutingConfigResponse(agent.routingConfig) : null,
  };

  // 取最近一次已发布 Version 的四分区 snapshot 作为 diff 基线
  const latest = await prisma.agentVersion.findFirst({
    where: { agentId },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
  });
  const baseline = latest
    ? {
        prompt: (latest.promptSnapshot as Config) ?? null,
        knowledge: (latest.knowledgeSnapshot as Config) ?? null,
        tools: (latest.toolsSnapshot as Config) ?? null,
        routing: (latest.routingSnapshot as Config) ?? null,
        version: latest.version,
      }
    : { prompt: null, knowledge: null, tools: null, routing: null, version: null };

  const candidates: { key: Partition; before: Config; after: Config }[] = [
    { key: "PROMPT", before: baseline.prompt, after: after.prompt },
    { key: "KNOWLEDGE", before: baseline.knowledge, after: after.knowledge },
    { key: "TOOLS", before: baseline.tools, after: after.tools },
    { key: "ROUTING", before: baseline.routing, after: after.routing },
  ];

  const changedPartitions = candidates
    .filter((c) => partitionChanged(c.before, c.after))
    .map((c) => c.key);

  if (changedPartitions.length === 0) {
    throw new ValidationError("没有任何配置变更，无法提交发布");
  }

  const configSnapshot = {
    prompt: after.prompt,
    knowledge: after.knowledge,
    tools: after.tools,
    routing: after.routing,
    snapshotAt: new Date().toISOString(),
  };

  const release = await prisma.release.create({
    data: {
      agentId,
      changeNote,
      changedPartitions,
      status: "PENDING",
      submittedBy: getActor().id,
      configSnapshot: configSnapshot as unknown as Prisma.InputJsonValue,
    },
    include: { agent: AGENT_BRIEF },
  });

  recordAudit("release.submit", "release", release.id, { agentId, changedPartitions });
  return withAgent(release);
}

/**
 * 审批发布。
 *
 * - 已处理的 release 再次审批 → ConflictError
 * - CHANGES_REQUESTED 必须带 reviewComment
 * - 软门禁：AI 评测 FAILED 的提交，批准必须带 reviewComment
 * - APPROVED 才生成 Version（与 release 状态同事务，保证一致性）
 */
export async function reviewRelease(
  releaseId: string,
  action: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED",
  reviewComment?: string,
) {
  const release = await prisma.release.findUnique({ where: { id: releaseId } });
  if (!release) throw new NotFoundError("Release 不存在");
  if (release.status !== "PENDING") {
    throw new ConflictError(`该 Release 已处理（当前状态：${release.status}）`);
  }
  if (action === "CHANGES_REQUESTED" && !reviewComment?.trim()) {
    throw new ValidationError("CHANGES_REQUESTED 必须填写审批意见");
  }
  const aiReviewStatus =
    (release.aiReview as { status?: string } | null | undefined)?.status ?? null;
  if (action === "APPROVED" && aiReviewStatus === "FAILED" && !reviewComment?.trim()) {
    throw new ValidationError(
      "AI 评测未通过：批准前必须填写审批意见，说明采纳理由或人工复核结论",
    );
  }

  const actor = getActor();
  const updated = await prisma.$transaction(async (tx) => {
    if (action === "APPROVED") {
      await createVersionFromRelease(tx, {
        agentId: release.agentId,
        changedPartitions: [...release.changedPartitions],
        configSnapshot: release.configSnapshot,
        releaseId: release.id,
        changeNote: release.changeNote,
      });
    }
    return tx.release.update({
      where: { id: releaseId },
      data: {
        status: action,
        approvedBy: actor.id,
        approvedAt: action === "APPROVED" ? new Date() : null,
        reviewComment: reviewComment ?? null,
      },
      include: { version: true },
    });
  });

  const auditAction =
    action === "APPROVED"
      ? "release.approve"
      : action === "REJECTED"
        ? "release.reject"
        : "release.changes_requested";
  recordAudit(auditAction, "release", releaseId, {
    agentId: release.agentId,
    reviewComment: reviewComment ?? null,
    ...(action === "APPROVED" ? { aiReviewStatus } : {}),
  });

  return toReleaseResponse(updated);
}

export interface CreateVersionParams {
  agentId: string;
  changedPartitions: Partition[];
  /** {prompt, knowledge, tools, routing, snapshotAt} 形状的提交快照 */
  configSnapshot: unknown;
  releaseId: string;
  changeNote: string;
}

/** 事务客户端参数化：reviewRelease 在事务里调用，保证 release 状态与 version 同生共死 */
type Db = Prisma.TransactionClient | typeof prisma;

/**
 * 从 release 生成不可变 Version 快照。
 * 版本号由 bumpVersion 基于该 agent 当前最高版本（按 SemVer 数值比较）+ 本次 changedPartitions 计算。
 */
export async function createVersionFromRelease(
  db: Db,
  params: CreateVersionParams,
): Promise<AgentVersion> {
  const allVersions = await db.agentVersion.findMany({
    where: { agentId: params.agentId },
    select: { version: true },
  });
  const currentTop = allVersions.map((v) => v.version).sort((a, b) => compareSemVer(b, a))[0];

  const next: SemVer = bumpVersion(currentTop, params.changedPartitions);
  const versionStr = formatVersion(next);

  const snapshot = (params.configSnapshot ?? {}) as Record<string, unknown>;
  return db.agentVersion.create({
    data: {
      agentId: params.agentId,
      version: versionStr,
      major: next.major,
      minor: next.minor,
      patch: next.patch,
      promptSnapshot: (snapshot.prompt ?? {}) as Prisma.InputJsonValue,
      knowledgeSnapshot: (snapshot.knowledge ?? {}) as Prisma.InputJsonValue,
      toolsSnapshot: (snapshot.tools ?? {}) as Prisma.InputJsonValue,
      routingSnapshot: (snapshot.routing ?? {}) as Prisma.InputJsonValue,
      releaseId: params.releaseId,
      publishedBy: getActor().id,
      changeNote: params.changeNote,
    },
  });
}

/**
 * 整版本回滚：把 Agent 当前的 4 分区 active config 覆盖为目标 Version 的 snapshot。
 *
 * - 一次性覆盖 4 个分区，无需先编辑草稿
 * - 创建一个 APPROVED Release（回滚是紧急恢复而非新增变更，不走审批流）
 * - 立即派生新 Version（版本号自增），确保历史快照不可变
 * - 审计 action = "agent.rollback"，details 含目标版本与 4 分区
 */
export async function createRollbackRelease(agentId: string, targetVersionId: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { id: true } });
  if (!agent) throw new NotFoundError("Agent 不存在");

  const target = await prisma.agentVersion.findUnique({ where: { id: targetVersionId } });
  if (!target) throw new NotFoundError("Version 不存在");
  if (target.agentId !== agentId) {
    throw new ValidationError("该 Version 不属于此 Agent");
  }

  const partitions: Partition[] = ["PROMPT", "KNOWLEDGE", "TOOLS", "ROUTING"];
  const snapshotKey: Record<Partition, "promptSnapshot" | "knowledgeSnapshot" | "toolsSnapshot" | "routingSnapshot"> = {
    PROMPT: "promptSnapshot",
    KNOWLEDGE: "knowledgeSnapshot",
    TOOLS: "toolsSnapshot",
    ROUTING: "routingSnapshot",
  };

  // 1) 覆盖 Agent 当前 4 分区为 target 的 snapshot（剥离 version/lastModifiedAt 元数据键）
  const configSnapshot: Record<string, unknown> = {};
  for (const p of partitions) {
    const raw = (target[snapshotKey[p]] as Record<string, unknown> | null) ?? {};
    const { version: _v, lastModifiedAt: _l, ...payload } = raw;
    void _v; void _l;
    configSnapshot[p.toLowerCase()] = payload;
    if (p === "PROMPT") await updatePromptConfig(agentId, payload);
    else if (p === "KNOWLEDGE") await updateKnowledgeConfig(agentId, payload);
    else if (p === "TOOLS") await updateToolsConfig(agentId, payload);
    else await updateRoutingConfig(agentId, payload);
  }

  // 2) status=APPROVED 的 release + 3) 立即派生新 Version（同事务）
  const actor = getActor();
  const ts = new Date();
  const snapshotAt = ts.toISOString();
  const { release, version } = await prisma.$transaction(async (tx) => {
    const rel = await tx.release.create({
      data: {
        agentId,
        changeNote: `回滚到 Version ${target.version}`,
        changedPartitions: partitions,
        status: "APPROVED",
        submittedBy: actor.id,
        submittedAt: ts,
        approvedBy: actor.id,
        approvedAt: ts,
        reviewComment: "回滚操作（紧急恢复，无需审批）",
        configSnapshot: { ...configSnapshot, snapshotAt } as unknown as Prisma.InputJsonValue,
        isRollback: true,
        rollbackFromVersion: target.version,
        rollbackToVersionId: target.id,
      },
      include: { agent: AGENT_BRIEF },
    });
    const newVersion = await createVersionFromRelease(tx, {
      agentId,
      changedPartitions: partitions,
      configSnapshot: { ...configSnapshot, snapshotAt },
      releaseId: rel.id,
      changeNote: `回滚到 v${target.version}`,
    });
    return { release: rel, version: newVersion };
  });

  // 4) 审计
  recordAudit("agent.rollback", "agent", agentId, {
    rollbackFromVersion: target.version,
    rollbackToVersionId: target.id,
    newVersionId: version.id,
    newVersion: version.version,
    partitions,
  });

  return {
    release: withAgent(release),
    version: toVersionResponse(version),
    restoredFrom: { id: target.id, version: target.version },
  };
}

export async function listReleases(agentId: string, status?: string) {
  // JSON 契约：未知 status 过滤结果为空（不回退为全量）
  if (status && status !== "ALL" && !(VALID_RELEASE_STATUSES as readonly string[]).includes(status)) {
    return [];
  }
  const rows = await prisma.release.findMany({
    where: {
      agentId,
      ...(status && status !== "ALL" && {
        status: status as (typeof VALID_RELEASE_STATUSES)[number],
      }),
    },
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    include: { agent: AGENT_BRIEF },
  });
  return rows.map(withAgent);
}
