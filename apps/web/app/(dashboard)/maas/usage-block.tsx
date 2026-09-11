"use client";

/* eslint-disable react/jsx-key -- Table 内部统一赋 key，行数组里的 JSX 属于误报（同 maas/page.tsx） */

/*
 * 每 Agent 模型用量块：GET /api/maas/usage 聚合试聊 trace 的真实数据（非 mock）。
 * 有 trace → LIVE 表格；无 trace → 回退 mock 演示口径并声明「尚无试聊数据」。
 * 诚实口径：数据仅覆盖试聊 Playground 产生的 trace，不代表生产调用分布。
 */
import { useEffect, useState } from "react";
import { Alert, Badge, Hint } from "@/components/ui";
import { Pill, Table } from "../architecture/_components/ui";

interface AgentUsage {
  agentId: string;
  agentName: string | null;
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

interface UsageReport {
  hasData: boolean;
  computedAt: string;
  agents: AgentUsage[];
}

/** 与原静态 mock 行保持同一口径，仅在无真实试聊数据时作为演示回退 */
const MOCK_ROWS = [
  ["ECS 工单助手", "qwen-max（百炼）", "qwen-plus", "12,480", "186M", "¥3,720", "2.8s", "78%"],
  ["RDS 工单助手", "qwen-plus（百炼）", "qwen-turbo", "5,214", "64M", "¥860", "1.9s", "71%"],
];

function fmtLatency(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

const LIVE_HEAD = ["Agent", "主模型", "调用次数", "Tokens（入/出）", "平均时延", "👍 / 👎", "最近调用"];

export function AgentUsageBlock() {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/maas/usage")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setReport(json.data as UsageReport);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, []);

  const liveRows = (report?.agents ?? []).map((a) => [
    <span>
      <strong>{a.agentName ?? a.agentId}</strong>
      {a.agentName ? null : <span className="ml-1 text-xs text-[var(--subtle)]">（agentId）</span>}
    </span>,
    a.model ?? "—",
    a.calls.toLocaleString("zh-CN"),
    `${a.promptTokens.toLocaleString("zh-CN")} / ${a.completionTokens.toLocaleString("zh-CN")}`,
    fmtLatency(a.avgLatencyMs),
    <span>
      {a.ratingsUp} / {a.ratingsDown}
      {a.unrated > 0 ? (
        <span className="ml-1 text-xs text-[var(--subtle)]">（未打分 {a.unrated}）</span>
      ) : null}
    </span>,
    fmtTime(a.lastCallAt),
  ]);

  return (
    <div>
      {failed && (
        <Alert tone="warn" title="未能读取真实用量" className="mb-3">
          真实用量接口这次没有返回成功，下面显示的是 mock 演示口径；刷新页面可重试。
        </Alert>
      )}

      {report && report.hasData ? (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="success" title="本表聚合的是试聊 Playground 真实调用落盘的 trace，非 mock">
              LIVE
            </Badge>
            <span className="text-xs text-[var(--subtle)]">
              聚合时间 {fmtTime(report.computedAt)}
            </span>
          </div>
          <Table caption="每个 Agent 的真实试聊调用用量：次数、tokens、平均时延与 👍/👎 打分" head={LIVE_HEAD} rows={liveRows} />
        </div>
      ) : (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Pill tone="neutral" title="尚无试聊数据，本表为 mock 演示口径">
              MOCK
            </Pill>
            <span className="text-xs text-[var(--subtle)]">尚无试聊数据：去任意 Agent 详情页试聊一次，本表将切换为真实聚合。</span>
          </div>
          <Table
            caption="每个 Agent 近 30 天的模型消费与效果指标（mock 演示口径），含主模型、兜底模型、调用量、token 量、预估成本、平均时延与解决率"
            head={["Agent", "主模型", "兜底", "调用次数", "Tokens", "预估成本", "平均时延", "解决率"]}
            rows={MOCK_ROWS.map((row) =>
              row.map((cell, i) =>
                i === 7 ? (
                  <Pill tone={cell === "78%" ? "good" : "warn"}>{cell}</Pill>
                ) : (
                  cell
                ),
              ),
            )}
          />
        </div>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-[var(--subtle)]">
        诚实口径：真实数据仅覆盖试聊 Playground 产生的 trace，不代表生产调用分布（L1 会话数据回流后覆盖面才完整）；
        mock 行的「解决率」指工单不转人工被 Agent 闭环解决的比例，「平均时延」为端到端往返耗时；
        专有云口径下同一配置切换为 Apsara Stack 私有化推理端点，指标口径一致，成本按公共云 DashScope 刊例价估算。
      </p>
      <Hint className="mt-2 max-w-3xl">
        试用动线：Agent 详情页「试聊 Playground」每次真实调用都会落盘 trace 并可 👍/👎 打分，
        本表随之更新——这就是「每一次模型消费都可归因到具体 Agent」的最小证明。
      </Hint>
    </div>
  );
}
