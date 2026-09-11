/**
 * 评测用例（Eval Case）服务：把被 👍/👎 的试聊 trace 沉淀为可回放的评测用例。
 *
 * 闭环语义：
 *   试聊（真实调用）→ 用户打分 → 沉淀为评测用例（保存完整输入 + 参考回复）
 *   → 下次提交发布时，AI 评测把用例在新配置下 replay，与参考回复对比判 PASS/FAIL。
 *
 * 与 Feedback 的分工：Feedback 是「缺陷上报 - 复盘 - 修复」的完整状态机；
 * EvalCase 是「回归评测」的语料库，两者都锚定 agentId，但生命周期不同
 * （case 可被删除/归档，feedback 有流转状态）。沉淀动作同时写审计日志。
 */
import { prisma, type Prisma } from "@agent-up/db";
import { getActor } from "@/lib/context";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit-service";
import { getTrace, type TraceRecord } from "@/lib/services/trace-service";

export interface EvalAssertion {
  type: "contains" | "not_contains" | "regex";
  /** contains/not_contains 为关键词；regex 为正则表达式（schema 已校验可编译） */
  value: string;
  /** 展示用说明，如「回复须包含工单号」 */
  description?: string;
}

export interface EvalCase {
  id: string;
  agentId: string;
  sourceTraceId: string;
  /** 用例标题：取自用户消息的摘要，便于列表与评测报告里快速识别 */
  title: string;
  /** 期望行为描述（沉淀时可填）；AI 评测与判官会参考它 */
  expectation: string;
  /** 确定性断言（可选）：发布前 AI 评测先跑断言，任一失败直接 FAIL 不调判官 */
  assertions?: EvalAssertion[];
  systemPrompt: string;
  history: TraceRecord["history"];
  message: string;
  /** 沉淀时刻的模型回复，作为回归评测的参考基准 */
  referenceReply: string;
  status: "ACTIVE";
  createdAt: string;
  createdBy: string;
}

const DEFAULT_EXPECTATION = "回复应正确、完整地解决用户问题，并遵守该 Agent 的约束";

/** 用例标题：取本轮用户消息首行前 32 字，避免超长刷屏 */
function summarizeTitle(message: string): string {
  const firstLine = message.split("\n")[0] ?? "";
  return firstLine.length > 32 ? `${firstLine.slice(0, 32)}…` : firstLine;
}

type EvalCaseRow = Prisma.EvalCaseGetPayload<Record<string, never>>;

export function toEvalCase(row: EvalCaseRow): EvalCase {
  return {
    id: row.id,
    agentId: row.agentId,
    sourceTraceId: row.sourceTraceId,
    title: row.title,
    expectation: row.expectation,
    ...(row.assertions
      ? { assertions: row.assertions as unknown as EvalAssertion[] }
      : {}),
    systemPrompt: row.systemPrompt,
    history: row.history as unknown as TraceRecord["history"],
    message: row.message,
    referenceReply: row.referenceReply,
    status: "ACTIVE",
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}

export async function listEvalCases(agentId: string): Promise<EvalCase[]> {
  const rows = await prisma.evalCase.findMany({
    where: { agentId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return rows.map(toEvalCase);
}

/** 从一条 trace 沉淀为评测用例。trace 必须属于该 agent，否则拒绝。 */
export async function createEvalCaseFromTrace(
  agentId: string,
  traceId: string,
  expectation?: string,
  assertions?: EvalAssertion[],
): Promise<EvalCase> {
  const trace = await getTrace(traceId);
  if (!trace) throw new NotFoundError("Trace 不存在，无法沉淀");
  if (trace.agentId !== agentId) {
    throw new ValidationError("该 Trace 不属于此 Agent，无法沉淀为它的评测用例");
  }

  const row = await prisma.evalCase.create({
    data: {
      agentId,
      sourceTraceId: traceId,
      title: summarizeTitle(trace.message),
      expectation: expectation?.trim() || DEFAULT_EXPECTATION,
      ...(assertions && assertions.length > 0
        ? { assertions: assertions as unknown as Prisma.InputJsonValue }
        : {}),
      systemPrompt: trace.systemPrompt,
      history: trace.history as unknown as Prisma.InputJsonValue,
      message: trace.message,
      referenceReply: trace.reply,
      createdBy: getActor().id,
    },
  });
  const evalCase = toEvalCase(row);
  recordAudit("eval_case.create", "eval_case", evalCase.id, {
    agentId,
    sourceTraceId: traceId,
    title: evalCase.title,
  });
  return evalCase;
}

export async function deleteEvalCase(id: string): Promise<void> {
  const row = await prisma.evalCase.findUnique({ where: { id }, select: { id: true } });
  if (!row) throw new NotFoundError("评测用例不存在");
  await prisma.evalCase.delete({ where: { id } });
  recordAudit("eval_case.delete", "eval_case", id, {});
}
