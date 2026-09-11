/**
 * 任务证据链服务：把一个 Agent 关联到的记录聚合成一条按时间倒序的证据链（只读，无新存储）。
 *
 * 节点来源（批4 起全部为 PG 表）：
 * - Feedback      → FEEDBACK（用户反馈：标题/状态/目标分区）
 * - Trace         → TRACE（试聊记录：打分、备注、是否已沉淀为评测用例）
 * - Release       → RELEASE（发布单：AI 评测结论；isRollback 的回滚单不重复出节点）
 * - AgentVersion  → VERSION（发布版本：是否有效果报告）
 * - AuditLog      → ROLLBACK（整版本回滚 / 分区级回滚审计，批1 起审计事实源在 PG）
 *
 * 诚实口径：证据链呈现的是「记录到的关联」（反馈→打分→用例→发布→评测→回滚的时间线），
 * 不是因果改进证明；响应固定携带 declaration 声明，页面原样展示。
 */
import { prisma } from "@agent-up/db";
import { NotFoundError } from "@/lib/errors";

export interface EvidenceNode {
  type: "FEEDBACK" | "TRACE" | "RELEASE" | "VERSION" | "ROLLBACK";
  /** 各来源实体自身的 id（审计日志场景为日志 id） */
  id: string;
  /** 事件时间（ISO）：反馈提交、试聊创建、发布提交、版本发布、审计时间 */
  at: string;
  title: string;
  /** 反馈/试聊/发布单自身的状态；VERSION/ROLLBACK 无状态为 null */
  status: string | null;
  detail: Record<string, unknown> | null;
}

export interface EvidenceChain {
  agentId: string;
  /** agent 已被归档/删除时为 null */
  agentName: string | null;
  /** 按事件时间倒序 */
  nodes: EvidenceNode[];
  computedAt: string;
  declaration: string;
}

const PARTITION_ROLLBACK_NOTE = /回滚到 Version\s+(\S+)/;

/** JsonValue → 自由形状对象（aiReview / audit.details 读取用） */
function detailOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function getEvidenceChain(agentId: string): Promise<EvidenceChain> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new NotFoundError("Agent 不存在");

  const nodes: EvidenceNode[] = [];

  const feedbacks = await prisma.feedback.findMany({ where: { agentId } });
  for (const fb of feedbacks) {
    nodes.push({
      type: "FEEDBACK",
      id: fb.id,
      at: fb.submittedAt.toISOString(),
      title: fb.title,
      status: fb.status,
      detail: {
        severity: fb.severity,
        rating: fb.rating,
        targetPartition: fb.targetPartition,
      },
    });
  }

  // trace → 已沉淀评测用例的反查表（sourceTraceId → evalCaseId）
  const evalCases = await prisma.evalCase.findMany({
    where: { agentId },
    select: { id: true, sourceTraceId: true },
  });
  const evalCaseByTrace = new Map(evalCases.map((ec) => [ec.sourceTraceId, ec.id]));

  const traces = await prisma.trace.findMany({ where: { agentId } });
  for (const tr of traces) {
    nodes.push({
      type: "TRACE",
      id: tr.id,
      at: tr.createdAt.toISOString(),
      title: tr.message,
      status: tr.rating,
      detail: {
        ratedAt: tr.ratedAt ? tr.ratedAt.toISOString() : null,
        note: tr.note,
        evalCaseId: evalCaseByTrace.get(tr.id) ?? null,
      },
    });
  }

  // 回滚单本身由 ROLLBACK 审计节点表达，避免同一次回滚重复计两个节点
  const releases = await prisma.release.findMany({ where: { agentId, isRollback: false } });
  for (const rel of releases) {
    const aiReview = detailOf(rel.aiReview) as { status?: string } | null;
    nodes.push({
      type: "RELEASE",
      id: rel.id,
      at: rel.submittedAt.toISOString(),
      title: rel.changeNote,
      status: rel.status,
      detail: {
        changedPartitions: [...rel.changedPartitions],
        aiReviewStatus: aiReview?.status ?? null,
      },
    });
  }

  const versions = await prisma.agentVersion.findMany({ where: { agentId } });
  for (const ver of versions) {
    nodes.push({
      type: "VERSION",
      id: ver.id,
      at: ver.publishedAt.toISOString(),
      title: `Version ${ver.version}`,
      status: null,
      detail: {
        version: ver.version,
        hasEffectivenessReport: ver.effectivenessReport != null,
        releaseId: ver.releaseId,
      },
    });
  }

  for (const log of await prisma.auditLog.findMany({ where: { resourceId: agentId } })) {
    const details = detailOf(log.details);
    if (log.action === "agent.rollback") {
      nodes.push({
        type: "ROLLBACK",
        id: log.id,
        at: log.createdAt.toISOString(),
        title: "整版本回滚",
        status: null,
        detail: {
          scope: "VERSION",
          rollbackFromVersion: details?.rollbackFromVersion ?? null,
          newVersion: details?.newVersion ?? null,
        },
      });
    } else if (log.action === "agent.config.update") {
      const partition = typeof details?.partition === "string" ? details.partition : null;
      const note = typeof details?.changeNote === "string" ? details.changeNote : "";
      const restored = note.match(PARTITION_ROLLBACK_NOTE);
      if (partition && restored) {
        nodes.push({
          type: "ROLLBACK",
          id: log.id,
          at: log.createdAt.toISOString(),
          title: "分区回滚",
          status: null,
          detail: {
            scope: "PARTITION",
            partition,
            restoredFromVersion: restored[1],
          },
        });
      }
    }
  }

  nodes.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));

  return {
    agentId,
    agentName: agent.name,
    nodes,
    computedAt: new Date().toISOString(),
    declaration: "证据链呈现记录到的关联，非因果改进证明",
  };
}
