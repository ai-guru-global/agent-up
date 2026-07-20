"use client";

import { useState, useEffect, useCallback } from "react";

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

interface WikiPageItem {
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

const LIFECYCLE_COLOR: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600",
  REVIEWED: "bg-amber-100 text-amber-700",
  VERIFIED: "bg-emerald-100 text-emerald-700",
  DISPUTED: "bg-red-100 text-red-600",
  ARCHIVED: "bg-zinc-100 text-zinc-500",
};
const TIER_COLOR: Record<string, string> = {
  CORE: "bg-[var(--accent)]/15 text-[var(--accent)]",
  SUPPORTING: "bg-zinc-100 text-zinc-600",
  PERIPHERAL: "bg-zinc-100 text-zinc-500",
};

export default function WikiPage() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null);
  const [pages, setPages] = useState<WikiPageItem[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const fetchVaults = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/wiki/vaults");
      const json = await res.json();
      if (json.success) setVaults(json.data.items);
      else setError(json.error || "加载失败");
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVaults();
  }, [fetchVaults]);

  const fetchPages = useCallback(async (vaultId: string) => {
    setPagesLoading(true);
    try {
      const res = await fetch(`/api/wiki/vaults/${vaultId}/pages`);
      const json = await res.json();
      if (json.success) setPages(json.data.items);
    } finally {
      setPagesLoading(false);
    }
  }, []);

  const selectVault = (vault: Vault) => {
    setSelectedVault(vault);
    fetchPages(vault.id);
  };

  return (
    <div className="flex gap-6">
      {/* Left pane – vault list */}
      <div className="w-80 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            知识库
          </h2>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98]"
          >
            + 新建
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-3 space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-md bg-[var(--surface-elevated)]"
              />
            ))}
          </div>
        ) : vaults.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed border-[var(--border)] p-6 text-center">
            <p className="text-sm text-zinc-400">暂无知识库</p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {vaults.map((v) => (
              <button
                key={v.id}
                onClick={() => selectVault(v)}
                className={`w-full rounded-md p-3 text-left ring-1 transition active:scale-[0.98] ${
                  selectedVault?.id === v.id
                    ? "bg-[var(--surface-elevated)] ring-[var(--accent)]"
                    : "bg-[var(--surface)] ring-[var(--border)] hover:ring-[var(--accent)]/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-[var(--foreground)]">
                    {v.name}
                  </h3>
                  {v.isShared && (
                    <span className="rounded px-1.5 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                      共享
                    </span>
                  )}
                </div>
                {v.description && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-zinc-400">
                    {v.description}
                  </p>
                )}
                <div className="mt-1 flex gap-3 text-xs text-zinc-400 tabular-nums">
                  <span>{v._count.pages} 页</span>
                  {v.agent && <span>{v.agent.name}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right pane – pages */}
      <div className="min-w-0 flex-1">
        {!selectedVault ? (
          <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-[var(--border)]">
            <p className="text-zinc-400">选择一个知识库查看页面</p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
                  {selectedVault.name}
                </h2>
                <div className="mt-1 flex gap-4 text-xs text-zinc-400 tabular-nums">
                  <span>{selectedVault._count.pages} 页</span>
                  <span>
                    平均置信度:{" "}
                    {(selectedVault.avgConfidence * 100).toFixed(0)}%
                  </span>
                  <span>孤立页: {selectedVault.orphanCount}</span>
                  {selectedVault.gitRepoUrl && (
                    <span>Git: {selectedVault.gitRepoUrl}</span>
                  )}
                </div>
              </div>
            </div>

            {pagesLoading ? (
              <div className="mt-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-md bg-[var(--surface-elevated)]"
                  />
                ))}
              </div>
            ) : pages.length === 0 ? (
              <div className="mt-4 rounded-md border border-dashed border-[var(--border)] p-8 text-center">
                <p className="text-sm text-zinc-400">暂无页面</p>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {pages.map((pg) => (
                  <div
                    key={pg.id}
                    className="rounded-md bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-medium text-[var(--foreground)]">
                        {pg.title}
                      </h4>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${LIFECYCLE_COLOR[pg.lifecycle] || ""}`}
                      >
                        {pg.lifecycle}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TIER_COLOR[pg.tier] || ""}`}
                      >
                        {pg.tier}
                      </span>
                      <span className="text-xs text-zinc-400 tabular-nums">
                        置信度: {(pg.baseConfidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    {pg.summary && (
                      <p className="mt-1 line-clamp-1 text-sm text-zinc-400">
                        {pg.summary}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400">
                      <span className="font-mono">{pg.slug}</span>
                      <span>
                        {new Date(pg.updatedAt).toLocaleDateString("zh-CN")}
                      </span>
                      {pg.tags.length > 0 && (
                        <div className="flex gap-1">
                          {pg.tags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-[var(--surface-elevated)] text-zinc-500"
                            >
                              {t}
                            </span>
                          ))}
                          {pg.tags.length > 3 && (
                            <span>+{pg.tags.length - 3}</span>
                          )}
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

      {showCreate && (
        <CreateVaultModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchVaults();
          }}
        />
      )}
    </div>
  );
}

function CreateVaultModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [gitRepoUrl, setGitRepoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    if (!name) {
      setErr("请填写名称");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/wiki/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          gitRepoUrl: gitRepoUrl || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) onCreated();
      else setErr(json.error);
    } catch {
      setErr("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-[var(--surface)] p-6 ring-1 ring-[var(--border)]">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
          新建知识库
        </h2>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">
              名称 *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">
              描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-[var(--accent)]"
              rows={2}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">
              Git 仓库 URL
            </label>
            <input
              value={gitRepoUrl}
              onChange={(e) => setGitRepoUrl(e.target.value)}
              className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-[var(--accent)]"
              placeholder="https://github.com/..."
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
