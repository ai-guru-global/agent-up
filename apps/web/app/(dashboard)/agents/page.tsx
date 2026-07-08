/* eslint-disable react-hooks/purity */
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
  DRAFT: "bg-yellow-100 text-yellow-800",
  ACTIVE: "bg-green-100 text-green-800",
  ARCHIVED: "bg-gray-100 text-gray-600",
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showCreate, setShowCreate] = useState(false);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const res = await fetch(`/api/agents?${params}`);
      const json = await res.json();
      if (json.success) setAgents(json.data.items);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAgents(); }, [search, statusFilter]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agent 管理</h1>
          <p className="mt-1 text-sm text-slate-500">管理所有 Agent 的四分区配置与发布流程</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 新建 Agent
        </button>
      </div>

      {/* Filters */}
      <div className="mt-6 flex gap-3">
        <input
          type="text"
          placeholder="搜索 Agent..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="ALL">全部状态</option>
          <option value="DRAFT">草稿</option>
          <option value="ACTIVE">活跃</option>
          <option value="ARCHIVED">已归档</option>
        </select>
      </div>

      {/* Agent List */}
      {loading ? (
        <div className="mt-8 text-center text-slate-500">加载中...</div>
      ) : agents.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-slate-500">暂无 Agent</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            创建第一个 Agent
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/agents/${agent.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{agent.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[agent.status] || ""}`}>
                      {agent.status}
                    </span>
                  </div>
                  {agent.description && (
                    <p className="mt-1 text-sm text-slate-500">{agent.description}</p>
                  )}
                </div>
                <div className="text-sm text-slate-400">
                  {new Date(agent.updatedAt).toLocaleDateString("zh-CN")}
                </div>
              </div>
              <div className="mt-3 flex gap-4 text-xs text-slate-500">
                <span>{agent.productGroup.displayName}</span>
                <span>{agent._count.feedbacks} 反馈</span>
                <span>{agent._count.versions} 版本</span>
                <span>{agent._count.skillBindings} Skills</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Modal (placeholder) */}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-900">新建 Agent</h2>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-slate-700">名称 *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="e.g. ECS 助手"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              rows={2}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">产品组 ID *</label>
            <input
              value={productGroupId}
              onChange={(e) => setProductGroupId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="输入产品组 ID"
            />
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
            {submitting ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
