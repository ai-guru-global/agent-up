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

const STATUS_OPTS = ["ALL","PENDING","APPROVED","REJECTED","CHANGES_REQUESTED"];
const STATUS_COLOR: Record<string,string> = {
  PENDING: "bg-amber-500/10 text-amber-400",
  APPROVED: "bg-emerald-500/10 text-emerald-400",
  REJECTED: "bg-red-500/10 text-red-400",
  CHANGES_REQUESTED: "bg-orange-500/10 text-orange-400",
};

export default function ReleasesPage() {
  const [items, setItems] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [processing, setProcessing] = useState<string | null>(null);

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
        <p className="mt-1 text-sm text-zinc-400">审核 Agent 配置变更并发布新版本</p>
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
                      <span>变更: {rel.changedPartitions.join(", ")}</span>
                    )}
                  </div>
                  {rel.reviewComment && (
                    <p className="mt-2 text-sm italic text-zinc-400">审批意见: {rel.reviewComment}</p>
                  )}
                </div>
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
