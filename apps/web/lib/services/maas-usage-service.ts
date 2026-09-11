/**
 * MaaS 用量服务：把 /maas 页「每 Agent 模型用量」从 mock 口径升级为真实聚合。
 *
 * 数据源是 data/traces/（试聊 Playground 每次真实调用落盘的 trace），
 * 聚合出每个 Agent 的调用次数、tokens、平均时延与 👍/👎 比例。
 *
 * 诚实口径：仅覆盖试聊 Playground 产生的 trace，不代表生产调用分布
 * （L1 会话数据回流后覆盖面才完整）；页面保留该声明。
 */
import { store } from "@/lib/data/store";
import type { TraceRecord } from "@/lib/services/trace-service";

export interface MaasAgentUsage {
  agentId: string;
  /** agent 已被归档/删除时为 null，页面回退显示 agentId */
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

export function getMaasUsageReport(): MaasUsageReport {
  const traces = store.list<TraceRecord>("traces");
  const agents = store.list<Record<string, unknown>>("agents");
  const nameOf = new Map(
    agents
      .filter((a) => typeof a.id === "string")
      .map((a) => [String(a.id), typeof a.name === "string" ? a.name : null]),
  );

  const groups = new Map<string, TraceRecord[]>();
  for (const t of traces) {
    if (!t || typeof t.agentId !== "string") continue;
    const list = groups.get(t.agentId) ?? [];
    list.push(t);
    groups.set(t.agentId, list);
  }

  const report: MaasAgentUsage[] = [];
  for (const [agentId, list] of groups) {
    const sorted = [...list].sort((a, b) =>
      String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")),
    );
    const sum = (pick: (t: TraceRecord) => unknown) =>
      list.reduce((acc, t) => acc + (Number(pick(t)) || 0), 0);
    const last = sorted[sorted.length - 1];
    report.push({
      agentId,
      agentName: nameOf.get(agentId) ?? null,
      model: typeof last?.model === "string" ? last.model : null,
      calls: list.length,
      promptTokens: sum((t) => t.usage?.promptTokens),
      completionTokens: sum((t) => t.usage?.completionTokens),
      totalTokens: sum((t) => t.usage?.totalTokens),
      avgLatencyMs: Math.round(sum((t) => t.latencyMs) / list.length),
      ratingsUp: list.filter((t) => t.rating === "UP").length,
      ratingsDown: list.filter((t) => t.rating === "DOWN").length,
      unrated: list.filter((t) => t.rating !== "UP" && t.rating !== "DOWN").length,
      lastCallAt: typeof last?.createdAt === "string" ? last.createdAt : null,
    });
  }

  report.sort((a, b) => b.calls - a.calls || a.agentId.localeCompare(b.agentId));
  return {
    hasData: report.length > 0,
    computedAt: store.now(),
    agents: report,
  };
}
