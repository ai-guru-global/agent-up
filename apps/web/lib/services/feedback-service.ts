import { store } from "@/lib/data/store";
import { getActor } from "@/lib/context";
import { NotFoundError, ValidationError, ConflictError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit-service";

type FeedbackStatus =
  | "NEW" | "TRIAGED" | "ASSIGNED" | "IN_PROGRESS"
  | "RESOLVED" | "VERIFIED" | "CLOSED" | "WONTFIX";

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

function withAgentName<T extends Record<string, unknown>>(item: T): T {
  const agent = store.read<{ id: string; name: string }>("agents", `${item.agentId}.json`);
  return { ...item, agent: agent ? { id: agent.id, name: agent.name } : null };
}

export async function listFeedback(params: {
  skip: number;
  take: number;
  agentId?: string;
  status?: string;
  severity?: string;
  rating?: string;
  tag?: string;
}) {
  const result = store.queryList<Record<string, unknown>>(
    ["feedback"],
    {
      ...(params.agentId && { agentId: (f) => f.agentId === params.agentId }),
      ...(params.status && params.status !== "ALL" && {
        status: (f) => f.status === params.status,
      }),
      ...(params.severity && params.severity !== "ALL" && {
        severity: (f) => f.severity === params.severity,
      }),
      ...(params.rating && params.rating !== "ALL" && {
        rating: (f) => f.rating === params.rating,
      }),
      ...(params.tag && {
        tag: (f) => Array.isArray(f.tags) && (f.tags as string[]).includes(params.tag!),
      }),
    },
    (a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)),
    params.skip,
    params.take,
  );
  // getFeedback / createFeedback / updateFeedback 都会填充 agent 字段，但列表接口漏了，
  // 导致反馈中心页读 fb.agent.name 时直接崩溃。这里补上，保证四个出口契约一致
  return { ...result, items: result.items.map(withAgentName) };
}

export async function getFeedback(id: string) {
  const fb = store.read<Record<string, unknown>>("feedback", `${id}.json`);
  if (!fb) return null;
  return withAgentName(fb);
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
  const agent = store.read("agents", `${input.agentId}.json`);
  if (!agent) throw new NotFoundError("Agent 不存在");

  const id = store.generateId();
  const ts = store.now();
  const feedback = {
    id,
    agentId: input.agentId,
    source: "MANUAL",
    title: input.title,
    content: input.content,
    rating: input.rating,
    tags: input.tags ?? [],
    severity: input.severity ?? "MINOR",
    status: "NEW",
    targetPartition: input.targetPartition ?? null,
    sessionData: input.sessionData ?? null,
    submittedBy: getActor().id,
    submittedAt: ts,
  };

  store.write(feedback, "feedback", `${id}.json`);
  recordAudit("feedback.create", "feedback", id, {
    agentId: input.agentId,
    rating: input.rating,
    severity: feedback.severity,
  });
  return withAgentName(feedback as Record<string, unknown>);
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
  const agent = store.read("agents", `${input.agentId}.json`);
  if (!agent) throw new NotFoundError("Agent 不存在");

  const draft = adapter(input);

  // 幂等：同渠道 + 同外部单号视为同一工单（webhook 重试保护）
  if (draft.externalRef.id) {
    const dup = store
      .list<Record<string, unknown>>("feedback")
      .find(
        (f) =>
          f.source === input.channel &&
          (f.externalRef as Record<string, unknown> | null)?.id === draft.externalRef.id,
      );
    if (dup) {
      throw new ConflictError(
        `该工单已接入：${String(dup.id)}`,
        { existingFeedbackId: dup.id, channel: input.channel },
      );
    }
  }

  const id = store.generateId();
  const ts = store.now();
  const feedback = {
    id,
    agentId: draft.agentId,
    source: input.channel,
    title: draft.title,
    content: draft.content,
    rating: draft.rating,
    tags: draft.tags ?? [],
    severity: draft.severity ?? "MINOR",
    status: "NEW",
    targetPartition: null,
    externalRef: draft.externalRef,
    sessionData: null,
    submittedBy: getActor().id,
    submittedAt: ts,
  };

  store.write(feedback, "feedback", `${id}.json`);
  recordAudit("feedback.ingest", "feedback", id, {
    channel: input.channel,
    externalRefId: draft.externalRef.id,
    severity: feedback.severity,
  });
  return withAgentName(feedback as Record<string, unknown>);
}

export async function updateFeedback(id: string, input: {
  status?: FeedbackStatus;
  severity?: "CRITICAL" | "MAJOR" | "MINOR" | "SUGGESTION";
  assignedTo?: string | null;
  resolution?: string | null;
  targetPartition?: "PROMPT" | "KNOWLEDGE" | "TOOLS" | "ROUTING" | null;
  verificationNote?: string | null;
}) {
  const fb = store.read<Record<string, unknown>>("feedback", `${id}.json`);
  if (!fb) throw new NotFoundError("Feedback 不存在");

  const currentStatus = fb.status as FeedbackStatus;

  if (input.status !== undefined) {
    assertTransition(currentStatus, input.status);
  }

  const ts = store.now();
  const updated: Record<string, unknown> = { ...fb };

  if (input.status !== undefined) {
    updated.status = input.status;
    if (input.status === "RESOLVED") updated.resolvedAt = ts;
    if (input.status === "ASSIGNED" && input.assignedTo) {
      updated.assignedTo = input.assignedTo;
      updated.assignedAt = ts;
    }
    if (input.status === "VERIFIED") {
      updated.verifiedAt = ts;
      if (input.verificationNote) updated.verificationNote = input.verificationNote;
    }
  }
  if (input.severity !== undefined) updated.severity = input.severity;
  if (input.resolution !== undefined) updated.resolution = input.resolution;
  if (input.targetPartition !== undefined) updated.targetPartition = input.targetPartition;

  store.write(updated, "feedback", `${id}.json`);
  recordAudit("feedback.update", "feedback", id, {
    from: currentStatus,
    to: input.status ?? currentStatus,
  });
  return withAgentName(updated);
}
