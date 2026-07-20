"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface AgentDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  productGroup: { id: string; name: string; displayName: string };
  _count: { feedbacks: number; releases: number; versions: number; skillBindings: number };
  releases: Array<{ id: string }>;
}

interface PromptConfig {
  systemPrompt: string;
  roleDefinition: string | null;
  constraints: string[];
  outputFormat: string | null;
}

interface KnowledgeConfig {
  searchStrategy: string;
  fallbackToMcp: boolean;
  maxWikiResults: number;
  confidenceThreshold: number;
}

const TABS = [
  { key: "prompt", label: "Prompt 配置" },
  { key: "knowledge", label: "Knowledge 配置" },
  { key: "tools", label: "Tools 配置" },
  { key: "routing", label: "Routing 配置" },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function AgentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("prompt");
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [editedConfig, setEditedConfig] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`/api/agents/${id}`)
      .then((r) => r.json())
      .then((json) => { if (json.success) setAgent(json.data); })
      .finally(() => setLoading(false));
  }, [id]);

  const fetchConfig = useCallback(async () => {
    const res = await fetch(`/api/agents/${id}/config/${activeTab}`);
    const json = await res.json();
    const cfg = json.success && json.data ? json.data : {};
    setConfig(cfg);
    setEditedConfig(cfg);
  }, [id, activeTab]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`/api/agents/${id}/config/${activeTab}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editedConfig),
      });
      const json = await res.json();
      if (json.success) {
        setConfig(json.data);
        setMsg("保存成功");
      } else {
        setMsg(json.error);
      }
    } catch {
      setMsg("网络错误");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="py-12 text-center text-sm text-zinc-400">
      <div className="mx-auto h-4 w-24 animate-pulse rounded bg-[var(--surface-elevated)]" />
    </div>
  );
  if (!agent) return <div className="py-12 text-center text-sm text-zinc-400">Agent 不存在</div>;

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link href="/agents" className="text-zinc-400 hover:text-[var(--foreground)]">&larr;</Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">{agent.name}</h1>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
              agent.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-600" :
              agent.status === "DRAFT" ? "bg-amber-500/10 text-amber-600" :
              "bg-zinc-500/10 text-zinc-400"
            }`}>{agent.status}</span>
          </div>
          {agent.description && <p className="mt-1 text-sm text-zinc-400">{agent.description}</p>}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-4 gap-4">
        <MiniStat label="反馈" value={agent._count.feedbacks} />
        <MiniStat label="版本" value={agent._count.versions} />
        <MiniStat label="Skills" value={agent._count.skillBindings} />
        <MiniStat label="待审批" value={agent.releases?.length ?? 0} />
      </div>

      <div className="mt-8 border-b border-[var(--border)]">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 pb-3 text-sm font-medium transition ${
                activeTab === tab.key
                  ? "border-[var(--accent)] text-[var(--foreground)]"
                  : "border-transparent text-zinc-400 hover:text-[var(--foreground)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        <div className="rounded-md bg-[var(--surface)] p-5 ring-1 ring-[var(--border)]">
          {activeTab === "prompt" && (
            <PromptEditor config={editedConfig as unknown as PromptConfig} onChange={(c) => setEditedConfig(c as unknown as Record<string, unknown>)} />
          )}
          {activeTab === "knowledge" && (
            <KnowledgeEditor config={editedConfig as unknown as KnowledgeConfig} onChange={(c) => setEditedConfig(c as unknown as Record<string, unknown>)} />
          )}
          {activeTab === "tools" && (
            <JsonEditor config={editedConfig} onChange={setEditedConfig} label="Tools 配置 (JSON)" />
          )}
          {activeTab === "routing" && (
            <JsonEditor config={editedConfig} onChange={setEditedConfig} label="Routing 配置 (JSON)" />
          )}
        </div>

        {msg && (
          <p className={`mt-3 text-sm ${msg === "保存成功" ? "text-emerald-600" : "text-red-600"}`}>{msg}</p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存配置"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
      <p className="text-2xl font-semibold tabular-nums text-[var(--foreground)]">{value}</p>
      <p className="text-xs text-zinc-400">{label}</p>
    </div>
  );
}

function PromptEditor({ config, onChange }: { config: PromptConfig; onChange: (c: PromptConfig) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-zinc-400">系统提示词 *</label>
        <textarea
          value={config.systemPrompt || ""}
          onChange={(e) => onChange({ ...config, systemPrompt: e.target.value })}
          className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 font-mono text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          rows={8}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-400">角色定义</label>
        <textarea
          value={config.roleDefinition || ""}
          onChange={(e) => onChange({ ...config, roleDefinition: e.target.value })}
          className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          rows={3}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-400">约束条件（每行一条）</label>
        <textarea
          value={(config.constraints || []).join("\n")}
          onChange={(e) => onChange({ ...config, constraints: e.target.value.split("\n").filter(Boolean) })}
          className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          rows={4}
          placeholder={"不要回答与产品无关的问题\n涉及价格时提醒用户查看官网"}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-400">输出格式</label>
        <input
          value={config.outputFormat || ""}
          onChange={(e) => onChange({ ...config, outputFormat: e.target.value })}
          className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          placeholder="e.g. Markdown / JSON / 纯文本"
        />
      </div>
    </div>
  );
}

function KnowledgeEditor({ config, onChange }: { config: KnowledgeConfig; onChange: (c: KnowledgeConfig) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-zinc-400">搜索策略</label>
        <select
          value={config.searchStrategy || "WIKI_FIRST"}
          onChange={(e) => onChange({ ...config, searchStrategy: e.target.value })}
          className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        >
          <option value="WIKI_FIRST">Wiki 优先</option>
          <option value="WIKI_ONLY">仅 Wiki</option>
          <option value="MCP_FIRST">MCP 优先</option>
          <option value="HYBRID">混合模式</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="fallback"
          checked={config.fallbackToMcp !== false}
          onChange={(e) => onChange({ ...config, fallbackToMcp: e.target.checked })}
          className="h-4 w-4 rounded ring-1 ring-[var(--border)]"
        />
        <label htmlFor="fallback" className="text-sm text-[var(--foreground)]">Wiki 未命中时回退到 MCP</label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-zinc-400">最大 Wiki 结果数</label>
          <input
            type="number"
            value={config.maxWikiResults || 5}
            onChange={(e) => onChange({ ...config, maxWikiResults: parseInt(e.target.value) })}
            className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm tabular-nums ring-1 ring-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-400">置信度阈值</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={config.confidenceThreshold || 0.6}
            onChange={(e) => onChange({ ...config, confidenceThreshold: parseFloat(e.target.value) })}
            className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm tabular-nums ring-1 ring-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
      </div>
    </div>
  );
}

function JsonEditor({ config, onChange, label }: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
  label: string;
}) {
  const [jsonStr, setJsonStr] = useState(JSON.stringify(config, null, 2));
  const [parseError, setParseError] = useState("");

  const handleChange = (val: string) => {
    setJsonStr(val);
    try {
      const parsed = JSON.parse(val) as Record<string, unknown>;
      setParseError("");
      onChange(parsed);
    } catch {
      setParseError("JSON 格式错误");
    }
  };

  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400">{label}</label>
      <textarea
        value={jsonStr}
        onChange={(e) => handleChange(e.target.value)}
        className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 font-mono text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        rows={16}
      />
      {parseError && <p className="mt-1 text-sm text-red-600">{parseError}</p>}
    </div>
  );
}
