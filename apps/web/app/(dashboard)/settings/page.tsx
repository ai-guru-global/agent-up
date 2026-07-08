/* eslint-disable react-hooks/purity */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useCallback } from "react";

type Tab = "groups" | "roles" | "audit";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("groups");

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">设置</h1>
        <p className="mt-1 text-sm text-slate-500">管理产品组、角色权限和审计日志</p>
      </div>

      <div className="mt-6 border-b border-slate-200">
        <nav className="flex gap-6">
          {([["groups","产品组"], ["roles","角色与权限"], ["audit","审计日志"]] as [Tab, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`pb-3 text-sm font-medium border-b-2 transition ${
                tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}>{label}</button>
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
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/product-groups");
      const json = await res.json();
      if (json.success) setGroups(json.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const handleCreate = async () => {
    if (!name || !displayName) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/product-groups", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, displayName }),
      });
      const json = await res.json();
      if (json.success) { setShowCreate(false); setName(""); setDisplayName(""); fetchGroups(); }
    } finally { setSubmitting(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">产品组管理</h2>
        <button onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          + 新建产品组
        </button>
      </div>

      {showCreate && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="标识名"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="显示名"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            <button onClick={handleCreate} disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              创建
            </button>
          </div>
        </div>
      )}

      {loading ? <p className="mt-4 text-sm text-slate-500">加载中...</p> : (
        <div className="mt-4 space-y-2">
          {groups.length === 0 ? <p className="text-sm text-slate-500">暂无产品组</p> : groups.map((g: any) => (
            <div key={g.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
              <div>
                <h3 className="font-medium text-slate-900">{g.displayName}</h3>
                <p className="text-xs text-slate-500">{g.name} · {g._count.agents} 个 Agent · {g._count.members} 个成员</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RolesTab() {
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, pRes] = await Promise.all([
        fetch("/api/settings/roles").then((r) => r.json()),
        fetch("/api/settings/permissions").then((r) => r.json()),
      ]);
      if (rRes.success) setRoles(rRes.data);
      if (pRes.success) setPermissions(pRes.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!name || !displayName) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/roles", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, displayName }),
      });
      const json = await res.json();
      if (json.success) { setShowCreate(false); setName(""); setDisplayName(""); fetchData(); }
    } finally { setSubmitting(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">角色与权限</h2>
        <button onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          + 新建角色
        </button>
      </div>

      {showCreate && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="角色标识"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="显示名"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            <button onClick={handleCreate} disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">创建</button>
          </div>
        </div>
      )}

      {loading ? <p className="mt-4 text-sm text-slate-500">加载中...</p> : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Roles */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-2">角色列表</h3>
            <div className="space-y-2">
              {roles.map((r: any) => (
                <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-slate-900">{r.displayName}</h4>
                    <div className="flex items-center gap-2">
                      {r.isSystem && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">系统</span>}
                      <span className="text-xs text-slate-400">{r._count.members} 成员</span>
                    </div>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{r.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.permissions.map((rp: any) => (
                      <span key={rp.permission.id} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                        {rp.permission.resource}:{rp.permission.action}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Permissions */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-2">权限列表 ({permissions.length})</h3>
            <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {permissions.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm text-slate-700">{p.resource}:{p.action}</span>
                  <span className="text-xs text-slate-400">{p._count.roles} 角色</span>
                </div>
              ))}
              {permissions.length === 0 && <p className="p-4 text-sm text-slate-500 text-center">暂无权限</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditLogsTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/settings/audit-logs?page=${page}&pageSize=20`)
      .then((r) => r.json())
      .then((json) => { if (json.success) setLogs(json.data.items); })
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">审计日志</h2>
      {loading ? <p className="mt-4 text-sm text-slate-500">加载中...</p> : (
        logs.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center">
            <p className="text-sm text-slate-500">暂无审计日志</p>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-600">操作</th>
                  <th className="px-4 py-3 font-medium text-slate-600">资源</th>
                  <th className="px-4 py-3 font-medium text-slate-600">用户</th>
                  <th className="px-4 py-3 font-medium text-slate-600">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{log.action}</td>
                    <td className="px-4 py-3 text-slate-600">{log.resource}:{log.resourceId}</td>
                    <td className="px-4 py-3 text-slate-600">{log.userName}</td>
                    <td className="px-4 py-3 text-slate-400">{new Date(log.createdAt).toLocaleString("zh-CN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">上一页</button>
              <span className="text-xs text-slate-500">第 {page} 页</span>
              <button onClick={() => setPage((p) => p + 1)}
                className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">下一页</button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
