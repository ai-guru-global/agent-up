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

interface AgentOption {
  id: string;
  name: string;
}

const STATUS_OPTS = ["ALL","NEW","TRIAGED","ASSIGNED","IN_PROGRESS","RESOLVED","VERIFIED","CLOSED","WONTFIX"];
const SEVERITY_OPTS = ["ALL","CRITICAL","MAJOR","MINOR","SUGGESTION"];

const STATUS_COLOR: Record<string,string> = {
  NEW: "bg-blue-500/10 text-blue-400",
  TRIAGED: "bg-amber-500/10 text-amber-400",
  ASSIGNED: "bg-violet-500/10 text-violet-400",
  IN_PROGRESS: "bg-amber-500/10 text-amber-400",
  RESOLVED: "bg-emerald-500/10 text-emerald-400",
  VERIFIED: "bg-emerald-500/10 text-emerald-400",
  CLOSED: "bg-zinc-500/10 text-zinc-400",
  WONTFIX: "bg-red-500/10 text-red-400",
};

const SEVERITY_COLOR: Record<string,string> = {
  CRITICAL: "bg-red-500/10 text-red-400",
  MAJOR: "bg-amber-500/10 text-amber-400",
  MINOR: "bg-zinc-500/10 text-zinc-400",
  SUGGESTION: "bg-zinc-500/10 text-zinc-400",
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
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [showCreate, setShowCreate] = useState(false);
  // AI 归因：feedbackId -> { loading, text, error }
  const [insights, setInsights] = useState<Record<string, { loading: boolean; text: string; error: string }>>({});

  const handleInsight = async (id: string) => {
    setInsights((m) => ({ ...m, [id]: { loading: true, text: "", error: "" } }));
    try {
      const res = await fetch(`/api/feedback/${id}/insight`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setInsights((m) => ({ ...m, [id]: { loading: false, text: json.data.insight, error: "" } }));
      } else {
        setInsights((m) => ({ ...m, [id]: { loading: false, text: "", error: json.error || "归因失败" } }));
      }
    } catch {
      setInsights((m) => ({ ...m, [id]: { loading: false, text: "", error: "网络错误" } }));
    }
  };

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams();
      if (statusFilter !== "ALL") p.set("status", statusFilter);
      if (severityFilter !== "ALL") p.set("severity", severityFilter);
      const res = await fetch(`/api/feedback?${p}`);
      const json = await res.json();
      if (json.success) setItems(json.data.items);
      else setError(json.error || "加载失败");
    } catch {
      setError("网络错误");
    } finally { setLoading(false); }
  }, [statusFilter, severityFilter]);

  // 拉取前同步重置 loading/error 是有意的；setState 均在 await 前完成，无级联风险
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchList(); }, [fetchList]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    await fetch("/api/feedback", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });
    fetchList();
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">反馈中心</h1>
          <p className="mt-1 text-sm text-zinc-400">收集、跟踪和处理 Agent 的用户反馈</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98]"
        >
          + 录入反馈
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400"
        >
          {STATUS_OPTS.map((s) => (
            <option key={s} value={s}>{s === "ALL" ? "全部状态" : s}</option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400"
        >
          {SEVERITY_OPTS.map((s) => (
            <option key={s} value={s}>{s === "ALL" ? "全部严重程度" : s}</option>
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
          <p className="text-zinc-400">暂无反馈记录</p>
          <button onClick={() => setShowCreate(true)} className="mt-3 text-sm font-medium text-[var(--accent)] hover:opacity-80">
            录入第一条反馈
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {items.map((fb) => (
            <div
              key={fb.id}
              className="rounded-md bg-[var(--surface)] p-5 ring-1 ring-[var(--border)] transition hover:ring-[var(--accent-muted)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-[var(--foreground)]">{fb.title}</h3>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_COLOR[fb.status] || ""}`}>{fb.status}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SEVERITY_COLOR[fb.severity] || ""}`}>{fb.severity}</span>
                    {fb.rating && (
                      <span className={`text-xs ${fb.rating === "POSITIVE" ? "text-emerald-400" : fb.rating === "NEGATIVE" ? "text-red-400" : "text-zinc-400"}`}>
                        {fb.rating}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{fb.content}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
                    <span>Agent: {fb.agent.name}</span>
                    {fb.targetPartition && <span>分区: {fb.targetPartition}</span>}
                    <span className="tabular-nums">{new Date(fb.submittedAt).toLocaleDateString("zh-CN")}</span>
                  </div>
                  {fb.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {fb.tags.map((t) => (
                        <span key={t} className="rounded bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[11px] font-medium text-zinc-400">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {fb.rating === "NEGATIVE" && (
                    <button
                      onClick={() => handleInsight(fb.id)}
                      disabled={insights[fb.id]?.loading}
                      className="whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/30 hover:bg-emerald-500/10 active:scale-[0.98] disabled:opacity-40"
                    >
                      {insights[fb.id]?.loading ? "分析中…" : "AI 归因"}
                    </button>
                  )}
                  {(NEXT_STATUS[fb.status] || []).map((ns) => (
                    <button
                      key={ns}
                      onClick={() => handleStatusChange(fb.id, ns)}
                      className="whitespace-nowrap rounded-md px-2.5 py-1 text-xs text-zinc-400 ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] active:scale-[0.98]"
                    >
                      → {ns}
                    </button>
                  ))}
                </div>
              </div>
              {insights[fb.id]?.text && (
                <div className="mt-3 whitespace-pre-wrap rounded-md bg-[var(--background)] p-3 text-[13px] leading-relaxed text-zinc-300 ring-1 ring-[var(--border)]">
                  <span className="mr-2 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-400">AI 归因</span>
                  {insights[fb.id].text}
                </div>
              )}
              {insights[fb.id]?.error && (
                <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">{insights[fb.id].error}</div>
              )}
            </div>
          ))}
        </div>
      )}

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
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentId, setAgentId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [rating, setRating] = useState<"POSITIVE" | "NEGATIVE" | "NEUTRAL">("NEUTRAL");
  const [severity, setSeverity] = useState<"CRITICAL" | "MAJOR" | "MINOR" | "SUGGESTION">("MINOR");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-[var(--surface)] p-6 ring-1 ring-[var(--border)]">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">录入反馈</h2>
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">Agent *</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400"
            >
              <option value="">选择 Agent...</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">标题 *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400"
              placeholder="简要描述反馈内容"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">详细内容 *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400"
              rows={4}
              placeholder="详细描述问题或建议..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-[var(--foreground)]">评价</label>
              <select
                value={rating}
                onChange={(e) => setRating(e.target.value as "POSITIVE" | "NEGATIVE" | "NEUTRAL")}
                className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400"
              >
                <option value="POSITIVE">正面</option>
                <option value="NEGATIVE">负面</option>
                <option value="NEUTRAL">中性</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--foreground)]">严重程度</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as "CRITICAL" | "MAJOR" | "MINOR" | "SUGGESTION")}
                className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400"
              >
                <option value="CRITICAL">严重</option>
                <option value="MAJOR">重要</option>
                <option value="MINOR">次要</option>
                <option value="SUGGESTION">建议</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">目标分区</label>
            <select
              value={targetPartition}
              onChange={(e) => setTargetPartition(e.target.value)}
              className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400"
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
          <button onClick={onClose} className="rounded-md px-4 py-1.5 text-sm font-medium text-[var(--foreground)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] active:scale-[0.98]">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? "提交中..." : "提交"}
          </button>
        </div>
      </div>
    </div>
  );
}
