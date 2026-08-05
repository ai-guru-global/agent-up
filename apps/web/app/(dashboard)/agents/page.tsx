"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  status: string;
  productGroup: { id: string; name: string; displayName: string };
  _count: { feedbacks: number; releases: number; versions: number; skillBindings: number };
  updatedAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-amber-500/10 text-amber-600",
  ACTIVE: "bg-emerald-500/10 text-emerald-600",
  ARCHIVED: "bg-zinc-500/10 text-zinc-400",
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showCreate, setShowCreate] = useState(false);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const res = await fetch(`/api/agents?${params}`);
      const json = await res.json();
      if (json.success) setAgents(json.data.items);
      else setError(json.error || "加载失败");
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  // 拉取前同步重置 loading/error 是有意的；setState 均在 await 前完成，无级联风险
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">Agent 管理</h1>
          <p className="mt-1 text-sm text-zinc-400">管理所有 Agent 的四分区配置与发布流程</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98]"
        >
          + 新建 Agent
        </button>
      </div>

      <div className="mt-6 flex gap-3">
        <input
          type="text"
          placeholder="搜索 Agent..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        >
          <option value="ALL">全部状态</option>
          <option value="DRAFT">草稿</option>
          <option value="ACTIVE">活跃</option>
          <option value="ARCHIVED">已归档</option>
        </select>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-md bg-[var(--surface-elevated)] p-5 ring-1 ring-[var(--border)]">
              <div className="h-4 w-48 rounded bg-[var(--border)]" />
              <div className="mt-3 h-3 w-32 rounded bg-[var(--border)]" />
            </div>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-[var(--border)] p-12 text-center">
          <p className="text-sm text-zinc-400">暂无 Agent</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm font-medium text-[var(--accent)] hover:opacity-80"
          >
            创建第一个 Agent
          </button>
        </div>
      ) : (
        <div className="mt-6 divide-y divide-[var(--border)] rounded-md ring-1 ring-[var(--border)]">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/agents/${agent.id}`}
              className="block bg-[var(--surface)] p-5 transition hover:bg-[var(--surface-elevated)]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[var(--foreground)]">{agent.name}</h3>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_BADGE[agent.status] || ""}`}>
                      {agent.status}
                    </span>
                  </div>
                  {agent.description && (
                    <p className="mt-1 text-sm text-zinc-400">{agent.description}</p>
                  )}
                </div>
                <div className="text-sm tabular-nums text-zinc-400">
                  {new Date(agent.updatedAt).toLocaleDateString("zh-CN")}
                </div>
              </div>
              <div className="mt-3 flex gap-4 text-xs tabular-nums text-zinc-400">
                <span>{agent.productGroup?.displayName || "-"}</span>
                <span>{agent._count?.feedbacks ?? 0} 反馈</span>
                <span>{agent._count?.versions ?? 0} 版本</span>
                <span>{agent._count?.skillBindings ?? 0} Skills</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateAgentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchAgents(); }}
        />
      )}
    </div>
  );
}

function CreateAgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [productGroupId, setProductGroupId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    if (!name || !productGroupId) { setErr("请填写必要字段"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined, productGroupId }),
      });
      const json = await res.json();
      if (json.success) { onCreated(); } else { setErr(json.error); }
    } catch {
      setErr("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-[var(--surface)] p-6 ring-1 ring-[var(--border)]">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">新建 Agent</h2>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-zinc-400">名称 *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              placeholder="e.g. ECS 助手"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              rows={2}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400">产品组 ID *</label>
            <input
              value={productGroupId}
              onChange={(e) => setProductGroupId(e.target.value)}
              className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              placeholder="输入产品组 ID"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-1.5 text-sm font-medium text-[var(--foreground)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] active:scale-[0.98]"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
