/**
 * 试聊 Trace 服务：把 Playground 每次真实调用落盘为可复盘记录。
 *
 * 一条 trace = 一次 chat 请求的完整上下文（组装后的 system prompt +
 * 会话历史 + 本轮消息）+ 模型回复 + 元信息。它既是「沉淀为评测用例」
 * 的数据源，也是回看历史试聊的凭据。
 *
 * 设计取舍：
 * - recordTrace 失败不抛错、返回 null —— 试聊主流程的回复已经拿到，
 *   落盘只是附加价值，文件系统故障不应让一次成功的对话变成 500。
 * - rating 支持 UP/DOWN + 可选 note，作为用户对单条回复的显式反馈，
 *   与 Feedback（工单级缺陷上报）互补：前者发生在 Playground 内联，
 *   后者走完整的状态机流转。
 */
import { store } from "@/lib/data/store";
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

/** 记录一次试聊。写入失败返回 null（不打断主流程），成功返回完整 trace。 */
export function recordTrace(input: {
  agentId: string;
  systemPrompt: string;
  history: TraceRecord["history"];
  message: string;
  reply: string;
  model: string;
  usage: LlmUsage;
  latencyMs: number;
}): TraceRecord | null {
  try {
    const trace: TraceRecord = {
      id: store.generateId(),
      ...input,
      createdAt: store.now(),
      rating: null,
      ratedAt: null,
      note: null,
    };
    store.write(trace, "traces", `${trace.id}.json`);
    return trace;
  } catch {
    return null;
  }
}

export function getTrace(id: string): TraceRecord | null {
  return store.read<TraceRecord>("traces", `${id}.json`);
}

/** 给一条 trace 打 👍 / 👎（可附简短说明），供沉淀为评测用例或复盘时定位。 */
export function rateTrace(id: string, rating: TraceRating, note?: string): TraceRecord {
  const trace = getTrace(id);
  if (!trace) throw new NotFoundError("Trace 不存在");
  const updated: TraceRecord = {
    ...trace,
    rating,
    ratedAt: store.now(),
    note: note?.trim() ? note.trim() : null,
  };
  store.write(updated, "traces", `${id}.json`);
  return updated;
}
