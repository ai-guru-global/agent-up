/* eslint-disable react-hooks/purity */
/* eslint-disable @typescript-eslint/no-explicit-any */
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
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-600",
  CHANGES_REQUESTED: "bg-orange-100 text-orange-800",
};

export default function ReleasesPage() {
  const [items, setItems] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (statusFilter !== "ALL") p.set("status", statusFilter);
      const res = await fetch(`/api/releases?${p}`);
      const json = await res.json();
      if (json.success) setItems(json.data.items);
    } finally { setLoading(false); }
  }, [statusFilter]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchList(); }, [statusFilter]);

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
        <h1 className="text-2xl font-bold text-slate-900">发布审批</h1>
        <p className="mt-1 text-sm text-slate-500">审核 Agent 配置变更并发布新版本</p>
      </div>

      <div className="mt-6 flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          {STATUS_OPTS.map((s) => (
            <option key={s} value={s}>{s === "ALL" ? "全部状态" : s}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="mt-8 text-center text-slate-500">加载中...</div>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-slate-500">暂无发布审批记录</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {items.map((rel) => (
            <div key={rel.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/agents/${rel.agentId}`} className="font-semibold text-slate-900 hover:text-blue-600">
                      {rel.agent.name}
                    </Link>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[rel.status] || ""}`}>
                      {rel.status}
                    </span>
                    {rel.version && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        v{rel.version.version}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{rel.changeNote}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                    <span>提交: {rel.submittedBy}</span>
                    <span>{new Date(rel.submittedAt).toLocaleString("zh-CN")}</span>
                    {rel.changedPartitions.length > 0 && (
                      <span>变更: {rel.changedPartitions.join(", ")}</span>
                    )}
                  </div>
                  {rel.reviewComment && (
                    <p className="mt-2 text-sm text-slate-500 italic">审批意见: {rel.reviewComment}</p>
                  )}
                </div>
                {rel.status === "PENDING" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReview(rel.id, "APPROVED")}
                      disabled={processing === rel.id}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      通过
                    </button>
                    <button
                      onClick={() => handleReview(rel.id, "REJECTED")}
                      disabled={processing === rel.id}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
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
