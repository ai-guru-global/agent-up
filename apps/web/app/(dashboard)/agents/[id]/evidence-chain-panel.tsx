"use client";

/*
 * 任务证据链（只读）：把该 Agent 的反馈、试聊打分、发布评测、版本、回滚
 * 聚合成一条时间线，回答「这条改进链路上发生过什么」。
 * 接口固定携带诚实声明：呈现的是记录到的关联，不是因果改进证明。
 */
import { useState, useEffect, useCallback } from "react";
import { Alert, Badge, EmptyState, Hint, Skeleton } from "@/components/ui";

interface EvidenceNode {
  type: "FEEDBACK" | "TRACE" | "RELEASE" | "VERSION" | "ROLLBACK";
  id: string;
  at: string;
  title: string;
  status: string | null;
  detail: Record<string, unknown> | null;
}

interface EvidenceChainData {
  agentId: string;
  nodes: EvidenceNode[];
  computedAt: string;
  declaration: string;
}

const TYPE_BADGES: Record<EvidenceNode["type"], { label: string; tone: "info" | "warn" | "accent" | "success" | "danger"; explain: string }> = {
  FEEDBACK: { label: "反馈", tone: "warn", explain: "用户在对话中提交的反馈工单" },
  TRACE: { label: "试聊", tone: "info", explain: "Playground 真实调用落盘的 trace（含打分）" },
  RELEASE: { label: "发布", tone: "accent", explain: "提交的发布单（含 AI 评测结论）" },
  VERSION: { label: "版本", tone: "success", explain: "审批通过后生成的不可变配置快照" },
  ROLLBACK: { label: "回滚", tone: "danger", explain: "整版本或分区级的回滚操作审计" },
};

function detailText(node: EvidenceNode): string | null {
  const d = node.detail ?? {};
  const parts: string[] = [];
  switch (node.type) {
    case "FEEDBACK": {
      if (d.severity) parts.push(`严重度 ${d.severity}`);
      if (d.rating) parts.push(`评级 ${d.rating}`);
      if (d.targetPartition) parts.push(`目标分区 ${d.targetPartition}`);
      break;
    }
    case "TRACE": {
      if (d.evalCaseId) parts.push("已沉淀为评测用例");
      if (d.note) parts.push(`打分备注：${d.note}`);
      break;
    }
    case "RELEASE": {
      const cp = d.changedPartitions;
      if (Array.isArray(cp) && cp.length > 0) parts.push(`变更分区 ${cp.join("、")}`);
      if (d.aiReviewStatus) parts.push(`AI 评测 ${d.aiReviewStatus}`);
      break;
    }
    case "VERSION": {
      if (d.hasEffectivenessReport) parts.push("含效果报告");
      break;
    }
    case "ROLLBACK": {
      if (d.scope === "PARTITION") {
        parts.push(`分区 ${d.partition} 恢复到 Version ${d.restoredFromVersion}`);
      } else {
        parts.push(`从 Version ${d.rollbackFromVersion} 回滚${d.newVersion ? `，派生新版本 ${d.newVersion}` : ""}`);
      }
      break;
    }
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function EvidenceChainPanel({ agentId }: { agentId: string }) {
  const [data, setData] = useState<EvidenceChainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const fetchChain = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/agents/${agentId}/evidence-chain`);
      const json = await res.json();
      if (json.success) setData(json.data);
      else {
        setData(null);
        setErr(json.error || "加载失败");
      }
    } catch {
      setData(null);
      setErr("网络错误");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  // 拉取前同步重置 loading/error 是有意的；setState 均在 await 前完成
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchChain(); }, [fetchChain]);

  return (
    <section className="mt-8" aria-labelledby="evidence-chain-heading">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="evidence-chain-heading" className="text-sm font-semibold text-[var(--foreground)]">
          任务证据链
        </h2>
        {data && data.nodes.length > 0 && (
          <Badge tone="info" title="反馈 → 试聊打分 → 发布评测 → 版本 → 回滚的时间线">
            {data.nodes.length} 个节点
          </Badge>
        )}
        <span className="text-[11px] text-[var(--subtle)]">
          这条 Agent 身上记录到的关联事件，按时间倒序
        </span>
      </div>

      {loading ? (
        <div className="mt-3 space-y-2" role="status" aria-live="polite">
          <span className="sr-only">正在加载证据链</span>
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-md" />
          ))}
        </div>
      ) : err ? (
        <Alert
          tone="danger"
          title="证据链加载失败"
          className="mt-3"
          onRetry={fetchChain}
        >
          {err}
        </Alert>
      ) : !data || data.nodes.length === 0 ? (
        <EmptyState
          className="mt-3"
          title="暂无证据节点"
          description="收到反馈、试聊打分、提交发布或执行回滚后，这里会出现对应的时间线节点。"
        />
      ) : (
        <ol className="mt-3 space-y-2">
          {data.nodes.map((n) => {
            const badge = TYPE_BADGES[n.type];
            const detail = detailText(n);
            return (
              <li key={`${n.type}-${n.id}`}>
                <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={badge.tone} title={badge.explain}>
                      {badge.label}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--foreground)]">
                      {n.title}
                    </span>
                    <span className="text-[10px] tabular-nums text-[var(--subtle)]">
                      {n.at ? new Date(n.at).toLocaleString("zh-CN") : ""}
                    </span>
                  </div>
                  {(n.status || detail) && (
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
                      {n.status && (
                        <span className="rounded border border-[var(--border)] bg-[var(--background)] px-1 py-px font-mono text-[10px]">
                          {n.status}
                        </span>
                      )}
                      {detail && <span className="text-[var(--subtle)]">{detail}</span>}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {data && data.nodes.length > 0 && (
        <Hint className="mt-3">{data.declaration}。证据链用于回答「发生过什么」，改进效果请看版本的效果报告与发布 AI 评测结论。</Hint>
      )}
    </section>
  );
}
