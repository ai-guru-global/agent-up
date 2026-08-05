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
  KNOWLEDGE_QUERY: "bg-blue-500/10 text-blue-400",
  DATA_FETCH: "bg-cyan-500/10 text-cyan-400",
  ACTION: "bg-orange-500/10 text-orange-400",
  TRANSFORM: "bg-violet-500/10 text-violet-400",
  GENERAL: "bg-zinc-500/10 text-zinc-400",
};
const STATUS_BADGE: Record<string,string> = {
  DRAFT: "bg-amber-500/10 text-amber-400",
  PUBLISHED: "bg-emerald-500/10 text-emerald-400",
  DEPRECATED: "bg-zinc-500/10 text-zinc-400",
  ARCHIVED: "bg-zinc-500/10 text-zinc-400",
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catFilter, setCatFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams();
      if (catFilter !== "ALL") p.set("category", catFilter);
      if (statusFilter !== "ALL") p.set("status", statusFilter);
      if (search) p.set("search", search);
      const res = await fetch(`/api/skills?${p}`);
      const json = await res.json();
      if (json.success) setSkills(json.data.items);
      else setError(json.error || "加载失败");
    } catch {
      setError("网络错误");
    } finally { setLoading(false); }
  }, [catFilter, statusFilter, search]);

  // 拉取前同步重置 loading/error 是有意的；setState 均在 await 前完成，无级联风险
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchList(); }, [fetchList]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">Skills 市场</h1>
          <p className="mt-1 text-sm text-zinc-400">管理和发现可复用的 Agent 技能组件</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98]"
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
          className="rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400"
        />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
          className="rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400">
          {CATS.map((c) => <option key={c} value={c}>{c === "ALL" ? "全部分类" : CAT_LABEL[c] || c}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400">
          <option value="ALL">全部状态</option>
          <option value="DRAFT">草稿</option>
          <option value="PUBLISHED">已发布</option>
          <option value="DEPRECATED">已弃用</option>
        </select>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-md bg-[var(--surface-elevated)] p-5 h-40" />
          ))}
        </div>
      ) : skills.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-[var(--border)] p-12 text-center">
          <p className="text-zinc-400">暂无 Skill</p>
          <button onClick={() => setShowCreate(true)} className="mt-3 text-sm font-medium text-[var(--accent)] hover:opacity-80">
            创建第一个 Skill
          </button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((sk) => (
            <div key={sk.id} className="rounded-md bg-[var(--surface)] p-5 ring-1 ring-[var(--border)] transition hover:ring-[var(--accent-muted)]">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-[var(--foreground)]">{sk.displayName}</h3>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_BADGE[sk.status] || ""}`}>{sk.status}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{sk.description}</p>
              <div className="mt-3 flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${CAT_COLOR[sk.category] || ""}`}>
                  {CAT_LABEL[sk.category] || sk.category}
                </span>
                <span className="text-xs text-zinc-500">{sk.runtime}</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                <span className="tabular-nums">v{sk.version}</span>
                <span className="tabular-nums">{sk._count.bindings} 个 Agent 使用</span>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-[var(--surface)] p-6 ring-1 ring-[var(--border)]">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">发布 Skill</h2>
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-[var(--foreground)]">标识名 *</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400"
                placeholder="wiki-search" />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--foreground)]">显示名 *</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400"
                placeholder="Wiki 搜索" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">描述 *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400"
              rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-[var(--foreground)]">分类</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400">
                {CATS.filter(c => c !== "ALL").map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--foreground)]">运行时</label>
              <select value={runtime} onChange={(e) => setRuntime(e.target.value)}
                className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400">
                <option value="HTTP">HTTP</option>
                <option value="FUNCTION">Function</option>
                <option value="MCP">MCP</option>
                <option value="WORKFLOW">Workflow</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">Endpoint</label>
            <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)}
              className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400"
              placeholder="https://api.example.com/skill" />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-md px-4 py-1.5 text-sm font-medium text-[var(--foreground)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] active:scale-[0.98]">取消</button>
          <button onClick={handleSubmit} disabled={submitting}
            className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98] disabled:opacity-50">
            {submitting ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
