/* eslint-disable react-hooks/purity */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Vault {
  id: string;
  name: string;
  description: string | null;
  agentId: string | null;
  agent: { id: string; name: string } | null;
  isShared: boolean;
  pageCount: number;
  avgConfidence: number;
  orphanCount: number;
  gitRepoUrl: string | null;
  updatedAt: string;
  _count: { pages: number; ingestJobs: number };
}

interface WikiPage {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  lifecycle: string;
  tier: string;
  baseConfidence: number;
  tags: string[];
  updatedAt: string;
}

const LIFECYCLE_COLOR: Record<string,string> = {
  DRAFT: "bg-yellow-100 text-yellow-800",
  REVIEWED: "bg-blue-100 text-blue-800",
  VERIFIED: "bg-green-100 text-green-800",
  DISPUTED: "bg-red-100 text-red-600",
  ARCHIVED: "bg-gray-100 text-gray-600",
};
const TIER_COLOR: Record<string,string> = {
  CORE: "bg-indigo-100 text-indigo-800",
  SUPPORTING: "bg-slate-100 text-slate-600",
  PERIPHERAL: "bg-gray-100 text-gray-500",
};

export default function WikiPage() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const fetchVaults = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wiki/vaults");
      const json = await res.json();
      if (json.success) setVaults(json.data.items);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchVaults(); }, [fetchVaults]);

  const fetchPages = useCallback(async (vaultId: string) => {
    setPagesLoading(true);
    try {
      const res = await fetch(`/api/wiki/vaults/${vaultId}/pages`);
      const json = await res.json();
      if (json.success) setPages(json.data.items);
    } finally { setPagesLoading(false); }
  }, []);

  const selectVault = (vault: Vault) => {
    setSelectedVault(vault);
    fetchPages(vault.id);
  };

  return (
    <div className="flex gap-6">
      {/* Left: Vault list */}
      <div className="w-80 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">知识库</h2>
          <button onClick={() => setShowCreate(true)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
            + 新建
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">加载中...</p>
        ) : vaults.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center">
            <p className="text-sm text-slate-500">暂无知识库</p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {vaults.map((v) => (
              <button key={v.id} onClick={() => selectVault(v)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  selectedVault?.id === v.id ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"
                }`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-slate-900">{v.name}</h3>
                  {v.isShared && <span className="text-xs text-blue-600">共享</span>}
                </div>
                {v.description && <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">{v.description}</p>}
                <div className="mt-1 flex gap-3 text-xs text-slate-400">
                  <span>{v._count.pages} 页</span>
                  {v.agent && <span>{v.agent.name}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: Pages */}
      <div className="flex-1 min-w-0">
        {!selectedVault ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300">
            <p className="text-slate-400">选择一个知识库查看页面</p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedVault.name}</h2>
                <div className="mt-1 flex gap-4 text-xs text-slate-500">
                  <span>{selectedVault._count.pages} 页</span>
                  <span>平均置信度: {(selectedVault.avgConfidence * 100).toFixed(0)}%</span>
                  <span>孤立页: {selectedVault.orphanCount}</span>
                  {selectedVault.gitRepoUrl && <span>Git: {selectedVault.gitRepoUrl}</span>}
                </div>
              </div>
            </div>

            {pagesLoading ? (
              <p className="mt-4 text-sm text-slate-500">加载页面中...</p>
            ) : pages.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center">
                <p className="text-sm text-slate-500">暂无页面</p>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {pages.map((pg) => (
                  <div key={pg.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-slate-900">{pg.title}</h4>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LIFECYCLE_COLOR[pg.lifecycle] || ""}`}>{pg.lifecycle}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIER_COLOR[pg.tier] || ""}`}>{pg.tier}</span>
                      <span className="text-xs text-slate-400">置信度: {(pg.baseConfidence * 100).toFixed(0)}%</span>
                    </div>
                    {pg.summary && <p className="mt-1 text-sm text-slate-500 line-clamp-1">{pg.summary}</p>}
                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                      <span>{pg.slug}</span>
                      <span>{new Date(pg.updatedAt).toLocaleDateString("zh-CN")}</span>
                      {pg.tags.length > 0 && (
                        <div className="flex gap-1">
                          {pg.tags.slice(0, 3).map((t: string) => (
                            <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{t}</span>
                          ))}
                          {pg.tags.length > 3 && <span>+{pg.tags.length - 3}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Vault Modal */}
      {showCreate && (
        <CreateVaultModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchVaults(); }} />
      )}
    </div>
  );
}

function CreateVaultModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [gitRepoUrl, setGitRepoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    if (!name) { setErr("请填写名称"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/wiki/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined, gitRepoUrl: gitRepoUrl || undefined }),
      });
      const json = await res.json();
      if (json.success) onCreated();
      else setErr(json.error);
    } catch { setErr("网络错误"); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-900">新建知识库</h2>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-slate-700">名称 *</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">描述</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" rows={2} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Git 仓库 URL</label>
            <input value={gitRepoUrl} onChange={(e) => setGitRepoUrl(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="https://github.com/..." />
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
