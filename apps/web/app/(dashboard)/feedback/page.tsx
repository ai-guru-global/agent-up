/* eslint-disable react-hooks/purity */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useCallback } from "react";

interface Feedback {
  id: string;
  title: string;
  content: string;
  status: string;
  severity: string;
  rating: string;
  tags: string[];
  submittedAt: string;
  agent: { id: string; name: string };
  targetPartition: string | null;
  resolution: string | null;
}

const STATUS_OPTS = ["ALL","NEW","TRIAGED","ASSIGNED","IN_PROGRESS","RESOLVED","VERIFIED","CLOSED","WONTFIX"];
const SEVERITY_OPTS = ["ALL","CRITICAL","MAJOR","MINOR","SUGGESTION"];

const STATUS_COLOR: Record<string,string> = {
  NEW: "bg-blue-100 text-blue-800",
  TRIAGED: "bg-indigo-100 text-indigo-800",
  ASSIGNED: "bg-purple-100 text-purple-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  RESOLVED: "bg-green-100 text-green-800",
  VERIFIED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-gray-100 text-gray-600",
  WONTFIX: "bg-red-100 text-red-600",
};

const SEVERITY_COLOR: Record<string,string> = {
  CRITICAL: "bg-red-100 text-red-800",
  MAJOR: "bg-orange-100 text-orange-800",
  MINOR: "bg-yellow-100 text-yellow-700",
  SUGGESTION: "bg-slate-100 text-slate-600",
};

const NEXT_STATUS: Record<string, string[]> = {
  NEW: ["TRIAGED", "WONTFIX"],
  TRIAGED: ["ASSIGNED", "WONTFIX"],
  ASSIGNED: ["IN_PROGRESS", "WONTFIX"],
  IN_PROGRESS: ["RESOLVED", "WONTFIX"],
  RESOLVED: ["VERIFIED", "IN_PROGRESS"],
  VERIFIED: ["CLOSED"],
  CLOSED: [],
  WONTFIX: [],
};

export default function FeedbackPage() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Feedback | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (statusFilter !== "ALL") p.set("status", statusFilter);
      if (severityFilter !== "ALL") p.set("severity", severityFilter);
      const res = await fetch(`/api/feedback?${p}`);
      const json = await res.json();
      if (json.success) setItems(json.data.items);
    } finally { setLoading(false); }
  }, [statusFilter, severityFilter]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchList(); }, [statusFilter, severityFilter]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    await fetch("/api/feedback", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });
    fetchList();
    if (selected?.id === id) setSelected(null);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">反馈中心</h1>
          <p className="mt-1 text-sm text-slate-500">收集、跟踪和处理 Agent 的用户反馈</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 录入反馈
        </button>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          {STATUS_OPTS.map((s) => (
            <option key={s} value={s}>{s === "ALL" ? "全部状态" : s}</option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          {SEVERITY_OPTS.map((s) => (
            <option key={s} value={s}>{s === "ALL" ? "全部严重程度" : s}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="mt-8 text-center text-slate-500">加载中...</div>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-slate-500">暂无反馈记录</p>
          <button onClick={() => setShowCreate(true)} className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">
            录入第一条反馈
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {items.map((fb) => (
            <div
              key={fb.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-slate-900">{fb.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[fb.status] || ""}`}>{fb.status}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_COLOR[fb.severity] || ""}`}>{fb.severity}</span>
                    {fb.rating && (
                      <span className={`text-xs ${fb.rating === "POSITIVE" ? "text-green-600" : fb.rating === "NEGATIVE" ? "text-red-600" : "text-slate-500"}`}>
                        {fb.rating === "POSITIVE" ? "👍" : fb.rating === "NEGATIVE" ? "👎" : "😐"} {fb.rating}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-600 line-clamp-2">{fb.content}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                    <span>Agent: {fb.agent.name}</span>
                    {fb.targetPartition && <span>分区: {fb.targetPartition}</span>}
                    <span>{new Date(fb.submittedAt).toLocaleDateString("zh-CN")}</span>
                  </div>
                  {fb.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {fb.tags.map((t: string) => (
                        <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {(NEXT_STATUS[fb.status] || []).map((ns) => (
                    <button
                      key={ns}
                      onClick={() => handleStatusChange(fb.id, ns)}
                      className="rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 hover:border-slate-300 whitespace-nowrap"
                    >
                      → {ns}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateFeedbackModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchList(); }}
        />
      )}
    </div>
  );
}

function CreateFeedbackModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [agents, setAgents] = useState<any[]>([]);
  const [agentId, setAgentId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [rating, setRating] = useState("NEUTRAL");
  const [severity, setSeverity] = useState("MINOR");
  const [targetPartition, setTargetPartition] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((j) => { if (j.success) setAgents(j.data.items); });
  }, []);

  const handleSubmit = async () => {
    if (!agentId || !title || !content) { setErr("请填写必要字段"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId, title, content, rating, severity,
          targetPartition: targetPartition || null,
        }),
      });
      const json = await res.json();
      if (json.success) onCreated();
      else setErr(json.error);
    } catch { setErr("网络错误"); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-slate-900">录入反馈</h2>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-slate-700">Agent *</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">选择 Agent...</option>
              {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">标题 *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="简要描述反馈内容"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">详细内容 *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              rows={4}
              placeholder="详细描述问题或建议..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700">评价</label>
              <select
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="POSITIVE">正面 👍</option>
                <option value="NEGATIVE">负面 👎</option>
                <option value="NEUTRAL">中性 😐</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">严重程度</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="CRITICAL">严重</option>
                <option value="MAJOR">重要</option>
                <option value="MINOR">次要</option>
                <option value="SUGGESTION">建议</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">目标分区</label>
            <select
              value={targetPartition}
              onChange={(e) => setTargetPartition(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">未指定</option>
              <option value="PROMPT">Prompt</option>
              <option value="KNOWLEDGE">Knowledge</option>
              <option value="TOOLS">Tools</option>
              <option value="ROUTING">Routing</option>
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "提交中..." : "提交"}
          </button>
        </div>
      </div>
    </div>
  );
}
