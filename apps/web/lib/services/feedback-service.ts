import {
  prisma,
  type FeedbackStatus,
  type FeedbackSeverity,
  type FeedbackRating,
  type Prisma,
} from "@agent-up/db";
import { getActor } from "@/lib/context";
import { NotFoundError, ValidationError, ConflictError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit-service";

/**
 * 反馈状态机：合法转移表。
 * 此前 updateFeedback 不校验转移，可从 NEW 直接跳 VERIFIED。
 * 终态：CLOSED / WONTFIX（不可再转）。
 */
const ALLOWED_TRANSITIONS: Record<FeedbackStatus, FeedbackStatus[]> = {
  NEW: ["TRIAGED", "WONTFIX", "CLOSED"],
  TRIAGED: ["ASSIGNED", "IN_PROGRESS", "WONTFIX", "CLOSED"],
  ASSIGNED: ["IN_PROGRESS", "WONTFIX", "CLOSED"],
  IN_PROGRESS: ["RESOLVED", "WONTFIX", "CLOSED"],
  RESOLVED: ["VERIFIED", "IN_PROGRESS", "CLOSED"],
  VERIFIED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: [],
  WONTFIX: [],
};

function assertTransition(from: FeedbackStatus, to: FeedbackStatus) {
  if (from === to) return; // 同状态（如只改 severity）允许
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new ValidationError(
      `非法状态转移：${from} → ${to}`,
      { from, to, allowed },
    );
  }
}

const AGENT_SELECT = { id: true, name: true } as const;
type FeedbackWithAgent = Prisma.FeedbackGetPayload<{
  include: { agent: { select: typeof AGENT_SELECT } };
}>;

/**
 * 旧 JSON 契约：时间戳与可选字段「设置后才出现键」，externalRef 只在
 * 工单接入记录上出现，agent 摘要恒有（null 占位）。列表/详情/创建/更新
 * 四个出口共用，保证形状一致。
 */
function toFeedbackResponse(row: FeedbackWithAgent) {
  return {
    id: row.id,
    agentId: row.agentId,
    source: row.source,
    title: row.title,
    content: row.content,
    rating: row.rating,
    tags: [...row.tags],
    severity: row.severity,
    status: row.status,
    targetPartition: row.targetPartition,
    sessionData: row.sessionData ?? null,
    submittedBy: row.submittedBy,
    submittedAt: row.submittedAt.toISOString(),
    ...(row.assignedTo !== null && {
      assignedTo: row.assignedTo,
      assignedAt: row.assignedAt!.toISOString(),
    }),
    ...(row.resolvedAt !== null && { resolvedAt: row.resolvedAt.toISOString() }),
    ...(row.verifiedAt !== null && { verifiedAt: row.verifiedAt.toISOString() }),
    ...(row.verificationNote !== null && { verificationNote: row.verificationNote }),
    ...(row.resolution !== null && { resolution: row.resolution }),
    ...(row.externalRefId !== null && {
      externalRef: { id: row.externalRefId, url: row.externalRefUrl },
    }),
    agent: row.agent ? { id: row.agent.id, name: row.agent.name } : null,
  };
}

const WITH_AGENT = { agent: { select: AGENT_SELECT } } as const;

export async function listFeedback(params: {
  skip: number;
  take: number;
  agentId?: string;
  status?: string;
  severity?: string;
  rating?: string;
  tag?: string;
}) {
  const where: Prisma.FeedbackWhereInput = {
    ...(params.agentId && { agentId: params.agentId }),
    ...(params.status && params.status !== "ALL" && { status: params.status as FeedbackStatus }),
    ...(params.severity && params.severity !== "ALL" && { severity: params.severity as FeedbackSeverity }),
    ...(params.rating && params.rating !== "ALL" && { rating: params.rating as FeedbackRating }),
    ...(params.tag && { tags: { has: params.tag } }),
  };
  const [rows, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      skip: params.skip,
      take: params.take,
      include: WITH_AGENT,
    }),
    prisma.feedback.count({ where }),
  ]);
  return { items: rows.map(toFeedbackResponse), total };
}

export async function getFeedback(id: string) {
  const row = await prisma.feedback.findUnique({ where: { id }, include: WITH_AGENT });
  if (!row) return null;
  return toFeedbackResponse(row);
}

export async function createFeedback(input: {
  agentId: string;
  title: string;
  content: string;
  rating: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  tags?: string[];
  severity?: "CRITICAL" | "MAJOR" | "MINOR" | "SUGGESTION";
  sessionData?: unknown;
  targetPartition?: "PROMPT" | "KNOWLEDGE" | "TOOLS" | "ROUTING" | null;
}) {
  const agent = await prisma.agent.findUnique({
    where: { id: input.agentId },
    select: AGENT_SELECT,
  });
  if (!agent) throw new NotFoundError("Agent 不存在");

  const created = await prisma.feedback.create({
    data: {
      agentId: input.agentId,
      source: "MANUAL",
      title: input.title,
      content: input.content,
      rating: input.rating,
      tags: input.tags ?? [],
      severity: input.severity ?? "MINOR",
      targetPartition: input.targetPartition ?? null,
      sessionData: (input.sessionData ?? null) as never,
      submittedBy: getActor().id,
    },
    include: WITH_AGENT,
  });

  recordAudit("feedback.create", "feedback", created.id, {
    agentId: input.agentId,
    rating: input.rating,
    severity: created.severity,
  });
  return toFeedbackResponse(created);
}

/**
 * 多渠道工单适配器（R5b）：机器接入反馈。
 *
 * 与 createFeedback（人：web 表单 / Chrome 插件）不同，ingest 面向工单系统
 * 原生日志接入：适配器注册表按 channel 把外部原生 payload 规范化为反馈字段，
 * 记录来源渠道（source）与外部单号（externalRef），并按「渠道 + 单号」幂等
 * （重复接入 409），防止 webhook 重试造成重复工单。
 * 新渠道 = 在 CHANNEL_ADAPTERS 加一个规范化函数，不改路由与存储。
 */
export type FeedbackChannel = "generic" | "ticket-webhook";

interface IngestDraft {
  agentId: string;
  title: string;
  content: string;
  rating: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  severity?: "CRITICAL" | "MAJOR" | "MINOR" | "SUGGESTION";
  tags?: string[];
  externalRef: { id: string | null; url: string | null };
}

/** P0→CRITICAL / P1→MAJOR / P2→MINOR / P3→SUGGESTION */
const PRIORITY_TO_SEVERITY: Record<string, "CRITICAL" | "MAJOR" | "MINOR" | "SUGGESTION"> = {
  P0: "CRITICAL",
  P1: "MAJOR",
  P2: "MINOR",
  P3: "SUGGESTION",
};

const CHANNEL_ADAPTERS: Record<FeedbackChannel, (payload: unknown) => IngestDraft> = {
  generic: (raw) => {
    const p = raw as {
      agentId: string;
      title: string;
      content: string;
      rating?: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
      severity?: "CRITICAL" | "MAJOR" | "MINOR" | "SUGGESTION";
      tags?: string[];
      externalId?: string;
      externalUrl?: string;
    };
    return {
      agentId: p.agentId,
      title: p.title,
      content: p.content,
      rating: p.rating ?? "NEGATIVE",
      severity: p.severity,
      tags: p.tags,
      externalRef: { id: p.externalId ?? null, url: p.externalUrl ?? null },
    };
  },
  "ticket-webhook": (raw) => {
    const p = raw as {
      agentId: string;
      ticket: { key: string; subject: string; description: string; priority: string; url?: string };
    };
    return {
      agentId: p.agentId,
      title: p.ticket.subject,
      content: p.ticket.description,
      // 工单即问题反馈
      rating: "NEGATIVE",
      severity: PRIORITY_TO_SEVERITY[p.ticket.priority] ?? "MINOR",
      externalRef: { id: p.ticket.key, url: p.ticket.url ?? null },
    };
  },
};

export async function ingestFeedback(
  input: { channel: FeedbackChannel; agentId: string } & Record<string, unknown>,
) {
  const adapter = CHANNEL_ADAPTERS[input.channel];
  if (!adapter) throw new ValidationError(`未知接入渠道：${input.channel}`);
  const agent = await prisma.agent.findUnique({
    where: { id: input.agentId },
    select: AGENT_SELECT,
  });
  if (!agent) throw new NotFoundError("Agent 不存在");

  const draft = adapter(input);

  // 幂等：同渠道 + 同外部单号视为同一工单（webhook 重试保护）
  if (draft.externalRef.id) {
    const dup = await prisma.feedback.findFirst({
      where: { source: input.channel, externalRefId: draft.externalRef.id },
      select: { id: true, title: true },
    });
    if (dup) {
      throw new ConflictError(
        `该工单已接入：${dup.id}`,
        { existingFeedbackId: dup.id, channel: input.channel },
      );
    }
  }

  const created = await prisma.feedback.create({
    data: {
      agentId: draft.agentId,
      source: input.channel,
      title: draft.title,
      content: draft.content,
      rating: draft.rating,
      tags: draft.tags ?? [],
      severity: draft.severity ?? "MINOR",
      externalRefId: draft.externalRef.id,
      externalRefUrl: draft.externalRef.url,
      submittedBy: getActor().id,
    },
    include: WITH_AGENT,
  });

  recordAudit("feedback.ingest", "feedback", created.id, {
    channel: input.channel,
    externalRefId: draft.externalRef.id,
    severity: created.severity,
  });
  return toFeedbackResponse(created);
}

export async function updateFeedback(id: string, input: {
  status?: FeedbackStatus;
  severity?: "CRITICAL" | "MAJOR" | "MINOR" | "SUGGESTION";
  assignedTo?: string | null;
  resolution?: string | null;
  targetPartition?: "PROMPT" | "KNOWLEDGE" | "TOOLS" | "ROUTING" | null;
  verificationNote?: string | null;
}) {
  const fb = await prisma.feedback.findUnique({ where: { id }, select: { status: true } });
  if (!fb) throw new NotFoundError("Feedback 不存在");

  const currentStatus = fb.status;
  if (input.status !== undefined) {
    assertTransition(currentStatus, input.status);
  }

  const data: Prisma.FeedbackUpdateInput = {};
  if (input.status !== undefined) {
    data.status = input.status;
    if (input.status === "RESOLVED") data.resolvedAt = new Date();
    if (input.status === "ASSIGNED" && input.assignedTo) {
      data.assignedTo = input.assignedTo;
      data.assignedAt = new Date();
    }
    if (input.status === "VERIFIED") {
      data.verifiedAt = new Date();
      if (input.verificationNote) data.verificationNote = input.verificationNote;
    }
  }
  if (input.severity !== undefined) data.severity = input.severity;
  if (input.resolution !== undefined) data.resolution = input.resolution;
  if (input.targetPartition !== undefined) data.targetPartition = input.targetPartition;

  const updated = await prisma.feedback.update({ where: { id }, data, include: WITH_AGENT });
  recordAudit("feedback.update", "feedback", id, {
    from: currentStatus,
    to: input.status ?? currentStatus,
  });
  return toFeedbackResponse(updated);
}
