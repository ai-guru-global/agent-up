/**
 * 试聊 Trace 服务：把 Playground 每次真实调用落盘为可复盘记录。
 *
 * 一条 trace = 一次 chat 请求的完整上下文（组装后的 system prompt +
 * 会话历史 + 本轮消息）+ 模型回复 + 元信息。它既是「沉淀为评测用例」
 * 的数据源，也是回看历史试聊的凭据。
 *
 * 设计取舍：
 * - recordTrace 失败不抛错、返回 null —— 试聊主流程的回复已经拿到，
 *   落盘只是附加价值，存储故障不应让一次成功的对话变成 500。
 * - rating 支持 UP/DOWN + 可选 note，作为用户对单条回复的显式反馈，
 *   与 Feedback（工单级缺陷上报）互补：前者发生在 Playground 内联，
 *   后者走完整的状态机流转。
 * - Trace.agentId 为 FK（RESTRICT）：调用方（chat 路由）已先校验 agent
 *   存在；deleteAgent 仅软归档，不会触发约束。
 */
import { prisma, type Prisma } from "@agent-up/db";
import { NotFoundError } from "@/lib/errors";
import type { LlmUsage } from "@/lib/services/llm-service";

export type TraceRating = "UP" | "DOWN";

export interface TraceRecord {
  id: string;
  agentId: string;
  /** 组装后的完整 system prompt（与 Playground / release replay 同源） */
  systemPrompt: string;
  /** 调用前的会话历史（user / assistant） */
  history: Array<{ role: "user" | "assistant"; content: string }>;
  /** 本轮用户消息 */
  message: string;
  reply: string;
  model: string;
  usage: LlmUsage;
  latencyMs: number;
  createdAt: string;
  rating: TraceRating | null;
  ratedAt: string | null;
  note: string | null;
}

type TraceRow = Prisma.TraceGetPayload<Record<string, never>>;

function toTraceRecord(row: TraceRow): TraceRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    systemPrompt: row.systemPrompt,
    history: row.history as unknown as TraceRecord["history"],
    message: row.message,
    reply: row.reply,
    model: row.model,
    usage: row.usage as unknown as LlmUsage,
    latencyMs: row.latencyMs,
    createdAt: row.createdAt.toISOString(),
    rating: (row.rating as TraceRating | null) ?? null,
    ratedAt: row.ratedAt ? row.ratedAt.toISOString() : null,
    note: row.note,
  };
}

/** 记录一次试聊。写入失败返回 null（不打断主流程），成功返回完整 trace。 */
export async function recordTrace(input: {
  agentId: string;
  systemPrompt: string;
  history: TraceRecord["history"];
  message: string;
  reply: string;
  model: string;
  usage: LlmUsage;
  latencyMs: number;
}): Promise<TraceRecord | null> {
  try {
    const row = await prisma.trace.create({
      data: {
        agentId: input.agentId,
        systemPrompt: input.systemPrompt,
        history: input.history as unknown as Prisma.InputJsonValue,
        message: input.message,
        reply: input.reply,
        model: input.model,
        usage: input.usage as unknown as Prisma.InputJsonValue,
        latencyMs: input.latencyMs,
      },
    });
    return toTraceRecord(row);
  } catch {
    return null;
  }
}

export async function getTrace(id: string): Promise<TraceRecord | null> {
  const row = await prisma.trace.findUnique({ where: { id } });
  return row ? toTraceRecord(row) : null;
}

/** 给一条 trace 打 👍 / 👎（可附简短说明），供沉淀为评测用例或复盘时定位。 */
export async function rateTrace(
  id: string,
  rating: TraceRating,
  note?: string,
): Promise<TraceRecord> {
  const row = await prisma.trace.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Trace 不存在");
  const updated = await prisma.trace.update({
    where: { id },
    data: {
      rating,
      ratedAt: new Date(),
      note: note?.trim() ? note.trim() : null,
    },
  });
  return toTraceRecord(updated);
}
