/* eslint-disable react-hooks/purity */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useCallback } from "react";

interface Skill {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  status: string;
  runtime: string;
  version: string;
  downloadCount: number;
  authorName: string;
  _count: { bindings: number; versions: number };
}

const CATS = ["ALL","KNOWLEDGE_QUERY","DATA_FETCH","ACTION","TRANSFORM","GENERAL"];
const CAT_LABEL: Record<string,string> = {
  KNOWLEDGE_QUERY: "知识检索", DATA_FETCH: "数据查询", ACTION: "动作执行", TRANSFORM: "数据转换", GENERAL: "通用",
};
const CAT_COLOR: Record<string,string> = {
  KNOWLEDGE_QUERY: "bg-blue-100 text-blue-800",
  DATA_FETCH: "bg-cyan-100 text-cyan-800",
  ACTION: "bg-orange-100 text-orange-800",
  TRANSFORM: "bg-purple-100 text-purple-800",
  GENERAL: "bg-slate-100 text-slate-600",
};
const STATUS_BADGE: Record<string,string> = {
  DRAFT: "bg-yellow-100 text-yellow-800",
  PUBLISHED: "bg-green-100 text-green-800",
  DEPRECATED: "bg-orange-100 text-orange-700",
  ARCHIVED: "bg-gray-100 text-gray-600",
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (catFilter !== "ALL") p.set("category", catFilter);
      if (statusFilter !== "ALL") p.set("status", statusFilter);
      if (search) p.set("search", search);
      const res = await fetch(`/api/skills?${p}`);
      const json = await res.json();
      if (json.success) setSkills(json.data.items);
    } finally { setLoading(false); }
  }, [catFilter, statusFilter, search]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchList(); }, [catFilter, statusFilter]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Skills 市场</h1>
          <p className="mt-1 text-sm text-slate-500">管理和发现可复用的 Agent 技能组件</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 发布 Skill
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="搜索 Skill..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          {CATS.map((c) => <option key={c} value={c}>{c === "ALL" ? "全部分类" : CAT_LABEL[c] || c}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="ALL">全部状态</option>
          <option value="DRAFT">草稿</option>
          <option value="PUBLISHED">已发布</option>
          <option value="DEPRECATED">已弃用</option>
        </select>
      </div>

      {loading ? (
        <div className="mt-8 text-center text-slate-500">加载中...</div>
      ) : skills.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-slate-500">暂无 Skill</p>
          <button onClick={() => setShowCreate(true)} className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">
            创建第一个 Skill
          </button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((sk) => (
            <div key={sk.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-slate-900">{sk.displayName}</h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[sk.status] || ""}`}>{sk.status}</span>
              </div>
              <p className="mt-1 text-sm text-slate-500 line-clamp-2">{sk.description}</p>
              <div className="mt-3 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CAT_COLOR[sk.category] || ""}`}>
                  {CAT_LABEL[sk.category] || sk.category}
                </span>
                <span className="text-xs text-slate-400">{sk.runtime}</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span>v{sk.version}</span>
                <span>{sk._count.bindings} 个 Agent 使用</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateSkillModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchList(); }} />
      )}
    </div>
  );
}

function CreateSkillModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("GENERAL");
  const [runtime, setRuntime] = useState("HTTP");
  const [endpoint, setEndpoint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    if (!name || !displayName || !description) { setErr("请填写必要字段"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, displayName, description, category, runtime, endpoint: endpoint || undefined }),
      });
      const json = await res.json();
      if (json.success) onCreated();
      else setErr(json.error);
    } catch { setErr("网络错误"); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-900">发布 Skill</h2>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700">标识名 *</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="wiki-search" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">显示名 *</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Wiki 搜索" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">描述 *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700">分类</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                {CATS.filter(c => c !== "ALL").map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">运行时</label>
              <select value={runtime} onChange={(e) => setRuntime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                <option value="HTTP">HTTP</option>
                <option value="FUNCTION">Function</option>
                <option value="MCP">MCP</option>
                <option value="WORKFLOW">Workflow</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Endpoint</label>
            <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="https://api.example.com/skill" />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">取消</button>
          <button onClick={handleSubmit} disabled={submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {submitting ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
