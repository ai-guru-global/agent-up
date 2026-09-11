/**
 * MaaS 用量服务：把 /maas 页「每 Agent 模型用量」从 mock 口径升级为真实聚合。
 *
 * 数据源是 Trace 表（试聊 Playground 每次真实调用落库的 trace），
 * 聚合出每个 Agent 的调用次数、tokens、平均时延与 👍/👎 比例。
 *
 * 诚实口径：仅覆盖试聊 Playground 产生的 trace，不代表生产调用分布
 * （L1 会话数据回流后覆盖面才完整）；页面保留该声明。
 *
 * D9（批4）：trace.agentId 是 FK，孤儿 trace 不可能存在，
 * 故 agentName 理论上恒非空；保留 null 分支仅为防御。
 */
import { prisma } from "@agent-up/db";

export interface MaasAgentUsage {
  agentId: string;
  /** agent 已被归档/删除时为 null，页面回退显示 agentId（FK 下不可达） */
  agentName: string | null;
  /** 最近一次调用使用的模型（主模型口径） */
  model: string | null;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
  ratingsUp: number;
  ratingsDown: number;
  unrated: number;
  lastCallAt: string | null;
}

export interface MaasUsageReport {
  /** 无任何 trace 时 false，页面回退 MOCK 演示口径并声明「尚无试聊数据」 */
  hasData: boolean;
  computedAt: string;
  /** 按调用次数降序 */
  agents: MaasAgentUsage[];
}

type TraceRow = Awaited<ReturnType<typeof prisma.trace.findMany>>[number];

function usageOf(t: TraceRow): Record<string, unknown> {
  return t.usage && typeof t.usage === "object" && !Array.isArray(t.usage)
    ? (t.usage as Record<string, unknown>)
    : {};
}

export async function getMaasUsageReport(): Promise<MaasUsageReport> {
  const [traces, agents] = await Promise.all([
    prisma.trace.findMany(),
    prisma.agent.findMany({ select: { id: true, name: true } }),
  ]);
  const nameOf = new Map(agents.map((a) => [a.id, a.name]));

  const groups = new Map<string, TraceRow[]>();
  for (const t of traces) {
    const list = groups.get(t.agentId) ?? [];
    list.push(t);
    groups.set(t.agentId, list);
  }

  const report: MaasAgentUsage[] = [];
  for (const [agentId, list] of groups) {
    const sorted = [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const sum = (pick: (t: TraceRow) => unknown) =>
      list.reduce((acc, t) => acc + (Number(pick(t)) || 0), 0);
    const last = sorted[sorted.length - 1];
    report.push({
      agentId,
      agentName: nameOf.get(agentId) ?? null,
      model: last?.model ?? null,
      calls: list.length,
      promptTokens: sum((t) => usageOf(t).promptTokens),
      completionTokens: sum((t) => usageOf(t).completionTokens),
      totalTokens: sum((t) => usageOf(t).totalTokens),
      avgLatencyMs: Math.round(sum((t) => t.latencyMs) / list.length),
      ratingsUp: list.filter((t) => t.rating === "UP").length,
      ratingsDown: list.filter((t) => t.rating === "DOWN").length,
      unrated: list.filter((t) => t.rating !== "UP" && t.rating !== "DOWN").length,
      lastCallAt: last ? last.createdAt.toISOString() : null,
    });
  }

  report.sort((a, b) => b.calls - a.calls || a.agentId.localeCompare(b.agentId));
  return {
    hasData: report.length > 0,
    computedAt: new Date().toISOString(),
    agents: report,
  };
}
