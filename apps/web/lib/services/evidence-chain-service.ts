/**
 * 任务证据链服务：把一个 Agent 关联到的记录聚合成一条按时间倒序的证据链（只读，无新存储）。
 *
 * 节点来源：
 * - feedback/        → FEEDBACK（用户反馈：标题/状态/目标分区）
 * - traces/          → TRACE（试聊记录：打分、备注、是否已沉淀为评测用例）
 * - releases/        → RELEASE（发布单：AI 评测结论；isRollback 的回滚单不重复出节点）
 * - versions/        → VERSION（发布版本：是否有效果报告）
 * - audit-logs       → ROLLBACK（整版本回滚 / 分区级回滚审计）
 *
 * 诚实口径：证据链呈现的是「记录到的关联」（反馈→打分→用例→发布→评测→回滚的时间线），
 * 不是因果改进证明；响应固定携带 declaration 声明，页面原样展示。
 */
import { NotFoundError } from "@/lib/errors";
import { store } from "@/lib/data/store";
import type { TraceRecord } from "@/lib/services/trace-service";

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

/** 与 ai-review-service 的结论结构对齐：只读 status 字段 */
interface ReleaseLike {
  id: string;
  agentId: string;
  changeNote?: string;
  status?: string;
  submittedAt?: string;
  changedPartitions?: unknown;
  aiReview?: { status?: string } | null;
  isRollback?: boolean;
}

interface VersionLike {
  id: string;
  agentId: string;
  version?: string;
  releaseId?: string;
  publishedAt?: string;
  effectivenessReport?: unknown;
}

interface FeedbackLike {
  id: string;
  agentId: string;
  title?: string;
  status?: string;
  rating?: string;
  severity?: string;
  targetPartition?: string;
  submittedAt?: string;
}

interface AuditLogLike {
  id: string;
  action: string;
  resourceId?: string;
  createdAt?: string;
  details?: Record<string, unknown> | null;
}

const PARTITION_ROLLBACK_NOTE = /回滚到 Version\s+(\S+)/;

export function getEvidenceChain(agentId: string): EvidenceChain {
  const agent = store.read<Record<string, unknown>>("agents", `${agentId}.json`);
  if (!agent) throw new NotFoundError("Agent 不存在");

  const nodes: EvidenceNode[] = [];

  for (const fb of store.list<FeedbackLike>("feedback")) {
    if (fb?.agentId !== agentId) continue;
    nodes.push({
      type: "FEEDBACK",
      id: fb.id,
      at: String(fb.submittedAt ?? ""),
      title: String(fb.title ?? "（无标题反馈）"),
      status: fb.status ?? null,
      detail: {
        severity: fb.severity ?? null,
        rating: fb.rating ?? null,
        targetPartition: fb.targetPartition ?? null,
      },
    });
  }

  // trace → 已沉淀评测用例的反查表（sourceTraceId → evalCaseId）
  const evalCaseByTrace = new Map<string, string>();
  for (const ec of store.list<Record<string, unknown>>("eval-cases")) {
    if (ec && typeof ec.sourceTraceId === "string" && typeof ec.id === "string") {
      evalCaseByTrace.set(ec.sourceTraceId, ec.id);
    }
  }
  for (const tr of store.list<TraceRecord>("traces")) {
    if (!tr || tr.agentId !== agentId) continue;
    nodes.push({
      type: "TRACE",
      id: tr.id,
      at: String(tr.createdAt ?? ""),
      title: tr.message,
      status: tr.rating ?? null,
      detail: {
        ratedAt: tr.ratedAt ?? null,
        note: tr.note ?? null,
        evalCaseId: evalCaseByTrace.get(tr.id) ?? null,
      },
    });
  }

  for (const rel of store.list<ReleaseLike>("releases")) {
    if (rel?.agentId !== agentId) continue;
    // 回滚单本身由 ROLLBACK 审计节点表达，避免同一次回滚重复计两个节点
    if (rel.isRollback === true) continue;
    nodes.push({
      type: "RELEASE",
      id: rel.id,
      at: String(rel.submittedAt ?? ""),
      title: String(rel.changeNote ?? "（无变更说明）"),
      status: rel.status ?? null,
      detail: {
        changedPartitions: rel.changedPartitions ?? null,
        aiReviewStatus: rel.aiReview?.status ?? null,
      },
    });
  }

  for (const ver of store.list<VersionLike>("versions")) {
    if (ver?.agentId !== agentId) continue;
    nodes.push({
      type: "VERSION",
      id: ver.id,
      at: String(ver.publishedAt ?? ""),
      title: `Version ${String(ver.version ?? "?")}`,
      status: null,
      detail: {
        version: ver.version ?? null,
        hasEffectivenessReport: ver.effectivenessReport != null,
        releaseId: ver.releaseId ?? null,
      },
    });
  }

  // audit-logs 是单个数组文件（非目录），用 readArray 读
  for (const log of store.readArray<AuditLogLike>("settings", "audit-logs.json")) {
    if (!log || log.resourceId !== agentId) continue;
    if (log.action === "agent.rollback") {
      nodes.push({
        type: "ROLLBACK",
        id: log.id,
        at: String(log.createdAt ?? ""),
        title: "整版本回滚",
        status: null,
        detail: {
          scope: "VERSION",
          rollbackFromVersion: log.details?.rollbackFromVersion ?? null,
          newVersion: log.details?.newVersion ?? null,
        },
      });
    } else if (log.action === "agent.config.update") {
      const partition = typeof log.details?.partition === "string" ? log.details.partition : null;
      const note = typeof log.details?.changeNote === "string" ? log.details.changeNote : "";
      const restored = note.match(PARTITION_ROLLBACK_NOTE);
      if (partition && restored) {
        nodes.push({
          type: "ROLLBACK",
          id: log.id,
          at: String(log.createdAt ?? ""),
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

  nodes.sort(
    (a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id),
  );

  return {
    agentId,
    agentName: typeof agent.name === "string" ? agent.name : null,
    nodes,
    computedAt: store.now(),
    declaration: "证据链呈现记录到的关联，非因果改进证明",
  };
}
