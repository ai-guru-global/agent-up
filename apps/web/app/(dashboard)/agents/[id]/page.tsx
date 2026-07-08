"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

/* eslint-disable react-hooks/purity */

const TABS = [
  { key: "prompt", label: "Prompt 配置" },
  { key: "knowledge", label: "Knowledge 配置" },
  { key: "tools", label: "Tools 配置" },
  { key: "routing", label: "Routing 配置" },
] as const;

export default function AgentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [agent, setAgent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("prompt");
  const [config, setConfig] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [editedConfig, setEditedConfig] = useState<any>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`/api/agents/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setAgent(json.data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetch(`/api/agents/${id}/config/${activeTab}`)
      .then((r) => r.json())
      .then((json) => {
        setConfig(json.success ? json.data : null);
        setEditedConfig(json.success && json.data ? json.data : {});
      });
  }, [id, activeTab]);

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

  if (loading) return <div className="text-center py-12 text-slate-500">加载中...</div>;
  if (!agent) return <div className="text-center py-12 text-slate-500">Agent 不存在</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/agents" className="text-slate-400 hover:text-slate-600">←</Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{agent.name}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              agent.status === "ACTIVE" ? "bg-green-100 text-green-800" :
              agent.status === "DRAFT" ? "bg-yellow-100 text-yellow-800" :
              "bg-gray-100 text-gray-600"
            }`}>{agent.status}</span>
          </div>
          {agent.description && <p className="text-sm text-slate-500 mt-1">{agent.description}</p>}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <MiniStat label="反馈" value={agent._count.feedbacks} />
        <MiniStat label="版本" value={agent._count.versions} />
        <MiniStat label="Skills" value={agent._count.skillBindings} />
        <MiniStat label="待审批" value={agent.releases?.length ?? 0} />
      </div>

      {/* Config Tabs */}
      <div className="mt-8 border-b border-slate-200">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Config Editor */}
      <div className="mt-6">
        {activeTab === "prompt" && (
          <PromptEditor config={editedConfig} onChange={setEditedConfig} />
        )}
        {activeTab === "knowledge" && (
          <KnowledgeEditor config={editedConfig} onChange={setEditedConfig} />
        )}
        {activeTab === "tools" && (
          <JsonEditor config={editedConfig} onChange={setEditedConfig} label="Tools 配置 (JSON)" />
        )}
        {activeTab === "routing" && (
          <JsonEditor config={editedConfig} onChange={setEditedConfig} label="Routing 配置 (JSON)" />
        )}

        {msg && (
          <p className={`mt-3 text-sm ${msg === "保存成功" ? "text-green-600" : "text-red-600"}`}>{msg}</p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function PromptEditor({ config, onChange }: { config: any; onChange: (c: any) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">系统提示词 *</label>
        <textarea
          value={config.systemPrompt || ""}
          onChange={(e) => onChange({ ...config, systemPrompt: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
          rows={8}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">角色定义</label>
        <textarea
          value={config.roleDefinition || ""}
          onChange={(e) => onChange({ ...config, roleDefinition: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          rows={3}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">约束条件（每行一条）</label>
        <textarea
          value={(config.constraints || []).join("\n")}
          onChange={(e) => onChange({ ...config, constraints: e.target.value.split("\n").filter(Boolean) })}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          rows={4}
          placeholder="不要回答与产品无关的问题&#10;涉及价格时提醒用户查看官网"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">输出格式</label>
        <input
          value={config.outputFormat || ""}
          onChange={(e) => onChange({ ...config, outputFormat: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="e.g. Markdown / JSON / 纯文本"
        />
      </div>
    </div>
  );
}

function KnowledgeEditor({ config, onChange }: { config: any; onChange: (c: any) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">搜索策略</label>
        <select
          value={config.searchStrategy || "WIKI_FIRST"}
          onChange={(e) => onChange({ ...config, searchStrategy: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
          className="h-4 w-4 rounded border-slate-300"
        />
        <label htmlFor="fallback" className="text-sm text-slate-700">Wiki 未命中时回退到 MCP</label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">最大 Wiki 结果数</label>
          <input
            type="number"
            value={config.maxWikiResults || 5}
            onChange={(e) => onChange({ ...config, maxWikiResults: parseInt(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">置信度阈值</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={config.confidenceThreshold || 0.6}
            onChange={(e) => onChange({ ...config, confidenceThreshold: parseFloat(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

function JsonEditor({ config, onChange, label }: { config: any; onChange: (c: any) => void; label: string }) {
  const [jsonStr, setJsonStr] = useState(JSON.stringify(config, null, 2));
  const [parseError, setParseError] = useState("");

  const handleChange = (val: string) => {
    setJsonStr(val);
    try {
      const parsed = JSON.parse(val);
      setParseError("");
      onChange(parsed);
    } catch {
      setParseError("JSON 格式错误");
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <textarea
        value={jsonStr}
        onChange={(e) => handleChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
        rows={16}
      />
      {parseError && <p className="mt-1 text-sm text-red-600">{parseError}</p>}
    </div>
  );
}
