"use client";

import { useState, useEffect, useCallback } from "react";

type Tab = "groups" | "roles" | "audit";

interface ProductGroup {
  id: string;
  name: string;
  displayName: string;
  _count: { agents: number; members: number };
}

interface Role {
  id: string;
  name: string;
  displayName: string;
  isSystem: boolean;
  _count: { members: number };
  permissions: Array<{
    permission: { id: string; resource: string; action: string };
  }>;
}

interface Permission {
  id: string;
  resource: string;
  action: string;
  _count: { roles: number };
}

interface AuditLog {
  id: string;
  action: string;
  resource: string;
  resourceId: string;
  userName: string;
  createdAt: string;
}

const TABS: [Tab, string][] = [
  ["groups", "产品组"],
  ["roles", "角色与权限"],
  ["audit", "审计日志"],
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("groups");

  return (
    <div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
          设置
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          管理产品组、角色权限和审计日志
        </p>
      </div>

      <div className="mt-6 border-b border-[var(--border)]">
        <nav className="flex gap-6">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pb-2 text-sm font-medium transition ${
                tab === key
                  ? "border-b-2 border-[var(--accent)] text-[var(--foreground)]"
                  : "text-zinc-400 hover:text-[var(--foreground)]"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {tab === "groups" && <ProductGroupsTab />}
        {tab === "roles" && <RolesTab />}
        {tab === "audit" && <AuditLogsTab />}
      </div>
    </div>
  );
}

function ProductGroupsTab() {
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/settings/product-groups");
      const json = await res.json();
      if (json.success) setGroups(json.data);
      else setError(json.error || "加载失败");
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, []);

  // 拉取前同步重置 loading/error 是有意的；setState 均在 await 前完成，无级联风险
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCreate = async () => {
    if (!name || !displayName) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/product-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, displayName }),
      });
      const json = await res.json();
      if (json.success) {
        setShowCreate(false);
        setName("");
        setDisplayName("");
        fetchGroups();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
          产品组管理
        </h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98]"
        >
          + 新建产品组
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {showCreate && (
        <div className="mt-4 rounded-md bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
          <div className="flex gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="标识名"
              className="rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-[var(--accent)]"
            />
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="显示名"
              className="rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-[var(--accent)]"
            />
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            >
              创建
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-md bg-[var(--surface-elevated)]"
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 divide-y divide-[var(--border)] rounded-md bg-[var(--surface)] ring-1 ring-[var(--border)]">
          {groups.length === 0 ? (
            <p className="p-4 text-sm text-zinc-400">暂无产品组</p>
          ) : (
            groups.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <h3 className="font-medium text-[var(--foreground)]">
                    {g.displayName}
                  </h3>
                  <p className="text-xs text-zinc-400 tabular-nums">
                    {g.name} &middot; {g._count.agents} 个 Agent &middot;{" "}
                    {g._count.members} 个成员
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rRes, pRes] = await Promise.all([
        fetch("/api/settings/roles").then((r) => r.json()),
        fetch("/api/settings/permissions").then((r) => r.json()),
      ]);
      if (rRes.success) setRoles(rRes.data);
      if (pRes.success) setPermissions(pRes.data);
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCreate = async () => {
    if (!name || !displayName) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, displayName }),
      });
      const json = await res.json();
      if (json.success) {
        setShowCreate(false);
        setName("");
        setDisplayName("");
        fetchData();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
          角色与权限
        </h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98]"
        >
          + 新建角色
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {showCreate && (
        <div className="mt-4 rounded-md bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
          <div className="flex gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="角色标识"
              className="rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-[var(--accent)]"
            />
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="显示名"
              className="rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-[var(--accent)]"
            />
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            >
              创建
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-md bg-[var(--surface-elevated)]"
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Roles list */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-400">
              角色列表
            </h3>
            <div className="space-y-2">
              {roles.map((r) => (
                <div
                  key={r.id}
                  className="rounded-md bg-[var(--surface)] p-3 ring-1 ring-[var(--border)]"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-[var(--foreground)]">
                      {r.displayName}
                    </h4>
                    <div className="flex items-center gap-2">
                      {r.isSystem && (
                        <span className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-700">
                          系统
                        </span>
                      )}
                      <span className="text-xs text-zinc-400 tabular-nums">
                        {r._count.members} 成员
                      </span>
                    </div>
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-zinc-400">
                    {r.name}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.permissions.map((rp) => (
                      <span
                        key={rp.permission.id}
                        className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-[var(--surface-elevated)] text-[var(--foreground)]"
                      >
                        {rp.permission.resource}:{rp.permission.action}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Permissions list */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-400">
              权限列表 ({permissions.length})
            </h3>
            <div className="max-h-96 divide-y divide-[var(--border)] overflow-y-auto rounded-md bg-[var(--surface)] ring-1 ring-[var(--border)]">
              {permissions.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <span className="font-mono text-sm text-[var(--foreground)]">
                    {p.resource}:{p.action}
                  </span>
                  <span className="text-xs text-zinc-400 tabular-nums">
                    {p._count.roles} 角色
                  </span>
                </div>
              ))}
              {permissions.length === 0 && (
                <p className="p-4 text-center text-sm text-zinc-400">
                  暂无权限
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditLogsTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  // 翻页时同步重置 loading/error 是有意的；后续 setState 均在异步回调中
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/settings/audit-logs?page=${page}&pageSize=20`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setLogs(json.data.items);
        else setError(json.error || "加载失败");
      })
      .catch(() => setError("网络错误"))
      .finally(() => setLoading(false));
  }, [page]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
        审计日志
      </h2>
      {error && (
        <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
      {loading ? (
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-md bg-[var(--surface-elevated)]"
            />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-[var(--border)] p-8 text-center">
          <p className="text-sm text-zinc-400">暂无审计日志</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-md bg-[var(--surface)] ring-1 ring-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-elevated)] text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-zinc-400">操作</th>
                <th className="px-4 py-3 font-medium text-zinc-400">资源</th>
                <th className="px-4 py-3 font-medium text-zinc-400">用户</th>
                <th className="px-4 py-3 font-medium text-zinc-400">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-[var(--surface-elevated)]"
                >
                  <td className="px-4 py-3 font-mono font-medium text-[var(--foreground)]">
                    {log.action}
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-400">
                    {log.resource}:{log.resourceId}
                  </td>
                  <td className="px-4 py-3 text-[var(--foreground)]">
                    {log.userName}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 tabular-nums">
                    {new Date(log.createdAt).toLocaleString("zh-CN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md px-4 py-1.5 text-sm font-medium text-[var(--foreground)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] active:scale-[0.98] disabled:opacity-50"
            >
              上一页
            </button>
            <span className="text-xs text-zinc-400 tabular-nums">
              第 {page} 页
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md px-4 py-1.5 text-sm font-medium text-[var(--foreground)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] active:scale-[0.98]"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
