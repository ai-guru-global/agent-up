/* eslint-disable react-hooks/purity */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface DashboardData {
  agents: { total: number; active: number };
  feedback: { total: number; pending: number };
  releases: { pending: number };
  recentFeedback: any[];
  recentReleases: any[];
}

export default function DashboardHome() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((json) => { if (json.success) setData(json.data); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-slate-500">加载中...</div>;

  const stats = data ?? { agents: { total: 0, active: 0 }, feedback: { total: 0, pending: 0 }, releases: { pending: 0 }, recentFeedback: [], recentReleases: [] };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">工作台</h1>
        <p className="mt-1 text-sm text-slate-500">Agent 改进平台概览</p>
      </div>

      {/* Stats Grid */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Agent 总数" value={stats.agents.total} description={`${stats.agents.active} 个活跃`} color="blue" />
        <StatCard title="待处理反馈" value={stats.feedback.pending} description={`共 ${stats.feedback.total} 条反馈`} color="orange" />
        <StatCard title="待审批发布" value={stats.releases.pending} description="等待审批的 Release" color="purple" />
        <StatCard title="活跃 Agent" value={stats.agents.active} description="已发布的 Agent" color="green" />
      </div>

      {/* Recent sections */}
      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Recent Feedback */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">最新反馈</h2>
            <Link href="/feedback" className="text-sm text-blue-600 hover:text-blue-700">查看全部 →</Link>
          </div>
          <div className="mt-3 space-y-2">
            {stats.recentFeedback.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">暂无反馈</p>
            ) : (
              stats.recentFeedback.map((fb: any) => (
                <div key={fb.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-medium text-slate-800 truncate">{fb.title}</h4>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      fb.severity === "CRITICAL" ? "bg-red-100 text-red-800" :
                      fb.severity === "MAJOR" ? "bg-orange-100 text-orange-800" :
                      "bg-slate-100 text-slate-600"
                    }`}>{fb.severity}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                    <span>{fb.agent?.name}</span>
                    <span>·</span>
                    <span>{fb.status}</span>
                    <span>·</span>
                    <span>{new Date(fb.submittedAt).toLocaleDateString("zh-CN")}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Recent Releases */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">最新发布</h2>
            <Link href="/releases" className="text-sm text-blue-600 hover:text-blue-700">查看全部 →</Link>
          </div>
          <div className="mt-3 space-y-2">
            {stats.recentReleases.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">暂无发布记录</p>
            ) : (
              stats.recentReleases.map((rel: any) => (
                <div key={rel.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/agents/${rel.agentId}`} className="text-sm font-medium text-slate-800 hover:text-blue-600 truncate">
                      {rel.agent?.name}
                    </Link>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      rel.status === "PENDING" ? "bg-yellow-100 text-yellow-800" :
                      rel.status === "APPROVED" ? "bg-green-100 text-green-800" :
                      "bg-red-100 text-red-600"
                    }`}>{rel.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 line-clamp-1">{rel.changeNote}</p>
                  <div className="mt-1 text-xs text-slate-400">
                    {new Date(rel.submittedAt).toLocaleDateString("zh-CN")} · {rel.submittedBy}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Quick Actions */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">快捷操作</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link href="/agents" className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-md">
            <h3 className="font-medium text-slate-900">管理 Agent</h3>
            <p className="mt-1 text-sm text-slate-500">查看和编辑 Agent 的四分区配置</p>
          </Link>
          <Link href="/feedback" className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-md">
            <h3 className="font-medium text-slate-900">处理反馈</h3>
            <p className="mt-1 text-sm text-slate-500">查看和处理用户反馈信息</p>
          </Link>
          <Link href="/releases" className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-md">
            <h3 className="font-medium text-slate-900">审批发布</h3>
            <p className="mt-1 text-sm text-slate-500">审核 Agent 配置变更并发布版本</p>
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, description, color }: {
  title: string; value: number; description: string; color: string;
}) {
  const bgMap: Record<string, string> = {
    blue: "bg-blue-50 border-blue-200",
    orange: "bg-orange-50 border-orange-200",
    purple: "bg-purple-50 border-purple-200",
    green: "bg-green-50 border-green-200",
  };
  const textMap: Record<string, string> = {
    blue: "text-blue-700",
    orange: "text-orange-700",
    purple: "text-purple-700",
    green: "text-green-700",
  };
  return (
    <div className={`rounded-xl border p-6 ${bgMap[color] || "bg-white border-slate-200"}`}>
      <h3 className="text-sm font-medium text-slate-600">{title}</h3>
      <p className={`mt-2 text-3xl font-bold ${textMap[color] || "text-slate-900"}`}>{value}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}
