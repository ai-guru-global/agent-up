"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Release {
  id: string;
  agentId: string;
  changeNote: string;
  status: string;
  submittedAt: string;
  submittedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  reviewComment: string | null;
  changedPartitions: string[];
  agent: { id: string; name: string };
  version: { id: string; version: string; publishedAt: string } | null;
}

const STATUS_OPTS = ["ALL", "PENDING", "APPROVED", "REJECTED", "CHANGES_REQUESTED"];
const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-400",
  APPROVED: "bg-emerald-500/10 text-emerald-400",
  REJECTED: "bg-red-500/10 text-red-400",
  CHANGES_REQUESTED: "bg-orange-500/10 text-orange-400",
};

const PARTITION_LABELS: Record<string, string> = {
  PROMPT: "Prompt",
  KNOWLEDGE: "知识",
  TOOLS: "工具",
  ROUTING: "路由",
};

export default function ReleasesPage() {
  const [items, setItems] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [processing, setProcessing] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams();
      if (statusFilter !== "ALL") p.set("status", statusFilter);
      const res = await fetch(`/api/releases?${p}`);
      const json = await res.json();
      if (json.success) setItems(json.data.items);
      else setError(json.error || "加载失败");
    } catch {
      setError("网络错误");
    } finally { setLoading(false); }
  }, [statusFilter]);

  // 拉取前同步重置 loading/error 是有意的；setState 均在 await 前完成，无级联风险
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchList(); }, [fetchList]);

  const handleReview = async (releaseId: string, action: "APPROVED" | "REJECTED") => {
    setProcessing(releaseId);
    try {
      await fetch(`/api/releases/${releaseId}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      fetchList();
    } finally { setProcessing(null); }
  };

  return (
    <div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">发布审批</h1>
        <p className="mt-1 text-sm text-zinc-400">审核 Agent 配置变更并发布新版本 · 点击「查看变更」展开 diff</p>
      </div>

      <div className="mt-6 flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400"
        >
          {STATUS_OPTS.map((s) => (
            <option key={s} value={s}>{s === "ALL" ? "全部状态" : s}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="mt-8 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-md bg-[var(--surface-elevated)] p-5 h-28" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-[var(--border)] p-12 text-center">
          <p className="text-zinc-400">暂无发布审批记录</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {items.map((rel) => (
            <div key={rel.id} className="rounded-md bg-[var(--surface)] p-5 ring-1 ring-[var(--border)]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/agents/${rel.agentId}`} className="font-semibold text-[var(--foreground)] hover:text-[var(--accent)]">
                      {rel.agent.name}
                    </Link>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_COLOR[rel.status] || ""}`}>
                      {rel.status}
                    </span>
                    {rel.version && (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-400 tabular-nums">
                        v{rel.version.version}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-zinc-400">{rel.changeNote}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
                    <span>提交: {rel.submittedBy}</span>
                    <span className="tabular-nums">{new Date(rel.submittedAt).toLocaleString("zh-CN")}</span>
                    {rel.changedPartitions.length > 0 && (
                      <span>变更: {rel.changedPartitions.map((p) => PARTITION_LABELS[p] || p).join(", ")}</span>
                    )}
                  </div>
                  {rel.reviewComment && (
                    <p className="mt-2 text-sm italic text-zinc-400">审批意见: {rel.reviewComment}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {rel.status === "PENDING" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReview(rel.id, "APPROVED")}
                        disabled={processing === rel.id}
                        className="rounded-md bg-emerald-500/20 px-3 py-1.5 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/30 active:scale-[0.98] disabled:opacity-50"
                      >
                        通过
                      </button>
                      <button
                        onClick={() => handleReview(rel.id, "REJECTED")}
                        disabled={processing === rel.id}
                        className="rounded-md bg-red-500/20 px-3 py-1.5 text-[11px] font-medium text-red-400 hover:bg-red-500/30 active:scale-[0.98] disabled:opacity-50"
                      >
                        拒绝
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => setExpandedId(expandedId === rel.id ? null : rel.id)}
                    className="rounded-md px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] ring-1 ring-[var(--accent)]/30 hover:bg-[var(--accent-muted)]/40 active:scale-[0.98]"
                  >
                    {expandedId === rel.id ? "收起变更" : "查看变更"}
                  </button>
                </div>
              </div>
              {expandedId === rel.id && (
                <DiffViewer releaseId={rel.id} changedPartitions={rel.changedPartitions} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 变更详情 diff 查看器：展开后拉取 release 的 configSnapshot + baseline，按分区渲染 diff */
function DiffViewer({
  releaseId,
  changedPartitions,
}: {
  releaseId: string;
  changedPartitions: string[];
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // AI 变更摘要（真实调用 MiMo）
  const [summary, setSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [sumErr, setSumErr] = useState("");

  const handleSummary = async () => {
    setSummarizing(true);
    setSumErr("");
    try {
      const res = await fetch(`/api/releases/${releaseId}/summary`, { method: "POST" });
      const json = await res.json();
      if (json.success) setSummary(json.data.summary);
      else setSumErr(json.error || "摘要生成失败");
    } catch {
      setSumErr("网络错误");
    } finally {
      setSummarizing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/releases/${releaseId}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) setData(json.data);
        else setErr(json.error || "加载失败");
      })
      .catch(() => { if (!cancelled) setErr("网络错误"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [releaseId]);

  if (loading) {
    return <div className="mt-4 animate-pulse rounded-md bg-[var(--surface-elevated)] h-32" />;
  }
  if (err) {
    return <div className="mt-4 rounded-md bg-red-500/10 px-4 py-2 text-xs text-red-400">{err}</div>;
  }
  if (!data) return null;

  const snapshot = (data.configSnapshot ?? {}) as Record<string, unknown>;
  const baseline = (data.baseline ?? {}) as Record<string, unknown>;

  const partitions = (changedPartitions.length > 0
    ? changedPartitions
    : ["PROMPT", "KNOWLEDGE", "TOOLS", "ROUTING"]
  ).map((p) => p.toLowerCase());

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
          变更详情（对比 Version {String(baseline.version || "初始")} → 本次）
        </p>
        <button
          onClick={handleSummary}
          disabled={summarizing}
          className="rounded-md px-2.5 py-1 text-[11px] font-medium text-emerald-400 ring-1 ring-emerald-500/30 hover:bg-emerald-500/10 active:scale-[0.98] disabled:opacity-40"
        >
          {summarizing ? "生成中…" : "AI 变更摘要"}
        </button>
      </div>
      {summary && (
        <div className="mb-3 whitespace-pre-wrap rounded-md bg-[var(--background)] p-3 text-[13px] leading-relaxed text-zinc-300 ring-1 ring-emerald-500/20">
          <span className="mr-2 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-400">AI 摘要</span>
          {summary}
        </div>
      )}
      {sumErr && (
        <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">{sumErr}</div>
      )}
      <div className="space-y-3">
        {partitions.map((p) => {
          const before = baseline[p] as Record<string, unknown> | null;
          const after = snapshot[p] as Record<string, unknown> | null;
          const diff = computeDiff(before, after);
          return (
            <PartitionDiff
              key={p}
              partition={p}
              before={before}
              after={after}
              diff={diff}
            />
          );
        })}
      </div>
    </div>
  );
}

/** 单分区的 diff 展示 */
function PartitionDiff({
  partition,
  before,
  after,
  diff,
}: {
  partition: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  diff: { added: string[]; removed: string[]; changed: string[] };
}) {
  const [showRaw, setShowRaw] = useState(false);
  const label = PARTITION_LABELS[partition.toUpperCase()] || partition;
  const hasChange = diff.added.length + diff.removed.length + diff.changed.length > 0;

  return (
    <div className="rounded-md bg-[var(--background)] ring-1 ring-[var(--border)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <span className="text-[12px] font-semibold text-[var(--foreground)]">{label}</span>
        <div className="flex items-center gap-2">
          {hasChange ? (
            <span className="text-[10px] text-zinc-400">
              <span className="text-emerald-400">+{diff.added.length}</span>{" "}
              <span className="text-red-400">-{diff.removed.length}</span>{" "}
              <span className="text-amber-400">~{diff.changed.length}</span>
            </span>
          ) : (
            <span className="text-[10px] text-zinc-500">无变更</span>
          )}
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="text-[10px] text-[var(--accent)] hover:underline"
          >
            {showRaw ? "摘要" : "原始 JSON"}
          </button>
        </div>
      </div>
      {showRaw ? (
        <div className="grid grid-cols-2 gap-px bg-[var(--border)]">
          <div className="bg-[var(--background)] p-3">
            <p className="text-[10px] font-medium uppercase text-zinc-500 mb-1">回滚前</p>
            <pre className="text-[10px] leading-relaxed text-zinc-400 overflow-x-auto max-h-48">
              {before ? JSON.stringify(before, null, 2) : "（空）"}
            </pre>
          </div>
          <div className="bg-[var(--background)] p-3">
            <p className="text-[10px] font-medium uppercase text-zinc-500 mb-1">本次提交</p>
            <pre className="text-[10px] leading-relaxed text-zinc-400 overflow-x-auto max-h-48">
              {after ? JSON.stringify(after, null, 2) : "（空）"}
            </pre>
          </div>
        </div>
      ) : hasChange ? (
        <div className="p-3 space-y-1">
          {diff.added.map((k) => (
            <DiffLine key={`a-${k}`} type="add" field={k} value={formatVal(after?.[k])} />
          ))}
          {diff.removed.map((k) => (
            <DiffLine key={`r-${k}`} type="remove" field={k} value={formatVal(before?.[k])} />
          ))}
          {diff.changed.map((k) => (
            <div key={`c-${k}`} className="text-[11px] leading-relaxed">
              <span className="text-amber-400 font-medium">~ {k}:</span>
              <span className="text-red-400 line-through ml-2">{formatVal(before?.[k])}</span>
              <span className="text-zinc-400 mx-1">→</span>
              <span className="text-emerald-400">{formatVal(after?.[k])}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-3 text-[11px] text-zinc-500">该分区与上一版本一致</div>
      )}
    </div>
  );
}

function DiffLine({ type, field, value }: { type: "add" | "remove"; field: string; value: string }) {
  const color = type === "add" ? "text-emerald-400" : "text-red-400";
  const symbol = type === "add" ? "+" : "-";
  return (
    <div className={`text-[11px] leading-relaxed ${color}`}>
      <span className="font-medium">{symbol} {field}:</span>{" "}
      <span className="opacity-80">{value}</span>
    </div>
  );
}

/** 浅层 diff（与后端 computeJsonDiff 逻辑一致） */
function computeDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): { added: string[]; removed: string[]; changed: string[] } {
  const a = before ?? {};
  const b = after ?? {};
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const k of Object.keys(a)) {
    if (!(k in b)) removed.push(k);
    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changed.push(k);
  }
  for (const k of Object.keys(b)) {
    if (!(k in a)) added.push(k);
  }
  return { added, removed, changed };
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return v.length > 80 ? v.slice(0, 80) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = JSON.stringify(v);
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}
