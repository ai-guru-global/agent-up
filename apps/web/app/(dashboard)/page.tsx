"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface DashboardData {
  agents: { total: number; active: number };
  feedback: { total: number; pending: number };
  releases: { pending: number };
  recentFeedback: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    submittedAt: string;
    agent: { id: string; name: string } | null;
  }>;
  recentReleases: Array<{
    id: string;
    agentId: string;
    changeNote: string;
    status: string;
    submittedAt: string;
    submittedBy: string;
    agent: { id: string; name: string } | null;
  }>;
}

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: "bg-red-500/10 text-red-600",
  MAJOR: "bg-amber-500/10 text-amber-600",
  MINOR: "bg-zinc-500/10 text-zinc-500",
  SUGGESTION: "bg-zinc-500/10 text-zinc-400",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-600",
  APPROVED: "bg-emerald-500/10 text-emerald-600",
  REJECTED: "bg-red-500/10 text-red-500",
};

export default function DashboardHome() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData(json.data);
        else setError(json.error || "加载失败");
      })
      .catch(() => setError("网络错误"))
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <div className="h-8 w-24 animate-pulse rounded bg-[var(--surface-elevated)]" />
        <div className="mt-8 grid grid-cols-2 gap-5 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-[var(--surface)]" />
          ))}
        </div>
        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-lg bg-[var(--surface)]" />
          <div className="h-64 animate-pulse rounded-lg bg-[var(--surface)]" />
        </div>
      </div>
    );
  }

  const d = data ?? {
    agents: { total: 0, active: 0 },
    feedback: { total: 0, pending: 0 },
    releases: { pending: 0 },
    recentFeedback: [],
    recentReleases: [],
  };

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">工作台</h1>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Agent" value={d.agents.total} sub={`${d.agents.active} active`} />
        <StatCard label="待处理反馈" value={d.feedback.pending} sub={`共 ${d.feedback.total} 条`} accent />
        <StatCard label="待审批" value={d.releases.pending} sub="Release" accent={d.releases.pending > 0} />
        <StatCard label="活跃 Agent" value={d.agents.active} sub="已发布" />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">最新反馈</h2>
            <Link href="/feedback" className="text-xs text-[var(--accent)] hover:underline">查看全部</Link>
          </div>
          <div className="mt-3 divide-y divide-[var(--border)]">
            {d.recentFeedback.length === 0 ? (
              <p className="py-10 text-center text-xs text-zinc-400">暂无反馈</p>
            ) : (
              d.recentFeedback.map((fb) => (
                <div key={fb.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm text-[var(--foreground)]">{fb.title}</h4>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
                      <span>{fb.agent?.name}</span>
                      <span className="text-zinc-300">/</span>
                      <span>{new Date(fb.submittedAt).toLocaleDateString("zh-CN")}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${SEVERITY_STYLE[fb.severity] || SEVERITY_STYLE.MINOR}`}>
                    {fb.severity}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">最新发布</h2>
            <Link href="/releases" className="text-xs text-[var(--accent)] hover:underline">查看全部</Link>
          </div>
          <div className="mt-3 divide-y divide-[var(--border)]">
            {d.recentReleases.length === 0 ? (
              <p className="py-10 text-center text-xs text-zinc-400">暂无发布记录</p>
            ) : (
              d.recentReleases.map((rel) => (
                <div key={rel.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/agents/${rel.agentId}`} className="truncate text-sm text-[var(--foreground)] hover:text-[var(--accent)]">
                      {rel.agent?.name}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-zinc-400">{rel.changeNote}</p>
                  </div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[rel.status] || "bg-zinc-500/10 text-zinc-500"}`}>
                    {rel.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="mt-10 flex gap-3">
        <Link href="/agents" className="rounded-md bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] ring-1 ring-[var(--border)] transition hover:ring-[var(--accent)]/40 active:scale-[0.98]">
          管理 Agent
        </Link>
        <Link href="/feedback" className="rounded-md bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] ring-1 ring-[var(--border)] transition hover:ring-[var(--accent)]/40 active:scale-[0.98]">
          处理反馈
        </Link>
        <Link href="/releases" className="rounded-md bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] ring-1 ring-[var(--border)] transition hover:ring-[var(--accent)]/40 active:scale-[0.98]">
          审批发布
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent }: {
  label: string; value: number; sub: string; accent?: boolean;
}) {
  return (
    <div className="rounded-lg bg-[var(--surface)] p-5 ring-1 ring-[var(--border)]">
      <p className="text-xs font-medium text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ? "text-[var(--accent)]" : "text-[var(--foreground)]"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>
    </div>
  );
}
