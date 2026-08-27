"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  CountLine,
  EmptyState,
  Field,
  Hint,
  Input,
  PageHeader,
  SectionTitle,
  Skeleton,
} from "@/components/ui";

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

/** 每个页签在讲什么 —— 切换前就能知道会看到什么 */
const TAB_HELP: Record<Tab, string> = {
  groups: "按业务线划分 Agent 与成员的归属单位",
  roles: "定义每个角色能对哪些资源做哪些动作",
  audit: "谁在什么时候改了什么，全部留痕可追溯",
};

/** 审计日志里的动作码含义。未登记的动作会原样显示，不影响阅读 */
const AUDIT_ACTION_HELP: Record<string, string> = {
  CREATE: "新建了一条记录",
  UPDATE: "修改了已有记录的字段",
  DELETE: "删除了一条记录",
  APPROVE: "审批通过了一次配置变更，并生成了新版本",
  REJECT: "驳回了一次配置变更，配置未上线",
  ROLLBACK: "把配置回滚到了某个历史版本",
  PUBLISH: "把配置发布上线，成为当前生效版本",
  LOGIN: "登录了平台",
  LOGOUT: "退出了平台",
};

/** 权限里的资源域含义 */
const RESOURCE_HELP: Record<string, string> = {
  agent: "Agent 本体与其四个分区的配置",
  feedback: "反馈中心的反馈单与分诊流转",
  release: "发布审批单与版本发布",
  skill: "Skills 能力注册表",
  wiki: "知识库与其中的知识页",
  settings: "产品组、角色权限与审计日志",
  maas: "模型服务的接入与用量",
};

/** 权限里的动作含义 */
const ACTION_HELP: Record<string, string> = {
  read: "查看，不能改动",
  list: "列出清单",
  create: "新建",
  update: "修改已有内容",
  delete: "删除",
  approve: "审批通过或驳回",
  rollback: "回滚到历史版本",
  publish: "发布上线",
  manage: "该资源下的全部操作",
  "*": "该资源下的全部操作",
};

/** 把 resource:action 翻译成一句人话，用于 title 提示 */
function permissionTitle(resource: string, action: string): string {
  const r = RESOURCE_HELP[resource] ?? `${resource} 资源`;
  const a = ACTION_HELP[action] ?? action;
  return `${resource}:${action} —— 对「${r}」的权限：${a}`;
}

const AUDIT_PAGE_SIZE = 20;

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("groups");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // WAI-ARIA tabs 模式：左右方向键在页签间移动，Home/End 跳到首尾
  const handleTabKeyDown = (e: ReactKeyboardEvent, index: number) => {
    const last = TABS.length - 1;
    let next = -1;
    if (e.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next][0]);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      <PageHeader
        title="设置"
        description="管理产品组、角色权限和审计日志"
        hint={
          <>
            这三块共同决定「谁能改什么、改了留不留痕」。产品组是归属单位 —— Agent 与成员都挂在某个产品组下，
            决定了默认可见范围；角色与权限决定一个人能对哪类资源做哪些动作；审计日志把所有敏感动作
            （配置发布、版本回滚、审批通过或驳回）连同操作人一起记下来，用于事后追溯。
            调整权限会立即对相关成员生效，无需重新登录，因此收紧权限前建议先确认没有正在进行的审批。
          </>
        }
      />

      <div className="border-b border-[var(--border)]">
        <div
          role="tablist"
          aria-label="设置分区"
          className="-mb-px flex gap-6 overflow-x-auto"
        >
          {TABS.map(([key, label], i) => (
            <button
              key={key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`settings-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`settings-panel-${key}`}
              tabIndex={tab === key ? 0 : -1}
              onKeyDown={(e) => handleTabKeyDown(e, i)}
              onClick={() => setTab(key)}
              title={TAB_HELP[key]}
              className={`shrink-0 whitespace-nowrap border-b-2 pb-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${
                tab === key
                  ? "border-[var(--accent)] text-[var(--foreground)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {TABS.map(([key]) => (
          <div
            key={key}
            role="tabpanel"
            id={`settings-panel-${key}`}
            aria-labelledby={`settings-tab-${key}`}
            hidden={tab !== key}
          >
            {tab === key && key === "groups" && <ProductGroupsTab />}
            {tab === key && key === "roles" && <RolesTab />}
            {tab === key && key === "audit" && <AuditLogsTab />}
          </div>
        ))}
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
  /** 创建失败的原因；原实现只在成功时才有反应，失败时按钮弹回、界面无任何提示 */
  const [createError, setCreateError] = useState("");

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/settings/product-groups");
      const json = await res.json();
      if (json.success) setGroups(json.data);
      else {
        // 失败时一并清空（与 wiki 的 fetchPages 一致）：重试失败时不能拿上一次的结果当当前数据
        setGroups([]);
        setError(json.error || "加载失败");
      }
    } catch {
      setGroups([]);
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
    if (!name || !displayName) {
      setCreateError("标识名与显示名都是必填项");
      return;
    }
    setSubmitting(true);
    setCreateError("");
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
      } else {
        setCreateError(json.error || "创建失败，产品组未创建");
      }
    } catch {
      setCreateError("网络错误，产品组未创建");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <SectionTitle
        title="产品组管理"
        description="产品组是 Agent 与成员的归属单位，通常对应一条业务线。它决定了成员默认能看到哪些 Agent，也是权限分配的基本范围。"
        actions={
          <Button
            variant="primary"
            onClick={() => setShowCreate(!showCreate)}
            aria-expanded={showCreate}
            aria-controls="create-group-form"
            title={showCreate ? "收起新建表单" : "展开表单，创建一个新的产品组"}
          >
            + 新建产品组
          </Button>
        }
      />

      {error && (
        <Alert
          tone="danger"
          title="产品组列表加载失败"
          className="mt-4"
          onRetry={fetchGroups}
          retryHint="点这里会重新请求一次产品组接口，不用刷新整个页面。"
        >
          {error}
          <span className="mt-1 block text-xs">
            数据来自 /api/settings/product-groups。请确认服务已启动后重试。
          </span>
        </Alert>
      )}

      {showCreate && (
        <div
          id="create-group-form"
          className="mt-4 rounded-md bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]"
        >
          <p className="text-[13px] leading-relaxed text-[var(--muted)]">
            标识名用于接口与配置引用，建议全小写加连字符且创建后不再更改；显示名是界面上给人看的名字，随时可改。
          </p>
          {createError && (
            <Alert tone="danger" title="创建未完成" className="mt-3">
              {createError}
            </Alert>
          )}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field
              label="标识名"
              required
              hint="程序内使用，例如 cloud-infra"
              className="sm:w-56"
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="标识名"
                />
              )}
            </Field>
            <Field
              label="显示名"
              required
              hint="界面展示，例如 云基础设施"
              className="sm:w-56"
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="显示名"
                />
              )}
            </Field>
            <Button
              variant="primary"
              onClick={handleCreate}
              loading={submitting}
              loadingText="创建中…"
              className="sm:mb-[2px]"
            >
              创建
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-4 space-y-2" role="status" aria-live="polite">
          <span className="sr-only">正在加载产品组列表</span>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-md" />
          ))}
        </div>
      ) : groups.length === 0 && !error ? (
        <EmptyState
          className="mt-4"
          title="暂无产品组"
          description="还没有创建任何产品组。产品组是 Agent 与成员的归属单位，先建一个，再把 Agent 和成员挂进来。"
          action={
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              新建第一个产品组
            </Button>
          }
          hint="标识名创建后不建议更改，因为配置与接口都通过它引用产品组。"
        />
      ) : (
        <>
          <CountLine
            className="mt-4"
            error={!!error}
            unknown="产品组数量这次没能取到 —— 上面是加载失败，不代表一个产品组都没有。"
          >
            共 {groups.length} 个产品组。每行第二排依次是标识名、该组下的 Agent 数量与成员数量。
          </CountLine>
          {/* 加载失败时连列表容器也不渲染：一是空容器（带 ring 边框）会看着像页面坏了，
              二是重试失败时 groups 里可能还留着上一次的结果，不能当成当前数据展示。
              上面的 CountLine 已经把状态说清楚了 */}
          {groups.length > 0 && !error && (
            <ul className="mt-2 divide-y divide-[var(--border)] rounded-md bg-[var(--surface)] ring-1 ring-[var(--border)]">
              {groups.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="font-medium text-[var(--foreground)]">{g.displayName}</h3>
                    <p className="text-xs tabular-nums text-[var(--muted)]">
                      <span className="cursor-help font-mono" title="标识名：程序与接口引用这个产品组时使用">
                        {g.name}
                      </span>{" "}
                      &middot;{" "}
                      <span title="归属于这个产品组的 Agent 数量">{g._count.agents} 个 Agent</span>{" "}
                      &middot;{" "}
                      <span title="加入这个产品组的成员数量">{g._count.members} 个成员</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // 角色与权限是两个独立接口，error 只能告诉用户「这一页出过问题」，
  // 不能用来判断具体哪一半没拿到。下面的标记与两个区域一一对应。
  const [rolesFailed, setRolesFailed] = useState(false);
  const [permsFailed, setPermsFailed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    setRolesFailed(false);
    setPermsFailed(false);
    try {
      // 两个请求各自吃掉异常：Promise.all 在其中一个抛错时会整体 reject，
      // 那样只会进下面的 catch，就把「权限挂了」错报成「角色与权限都挂了」
      const [rRes, pRes] = await Promise.all([
        fetch("/api/settings/roles").then((r) => r.json()).catch(() => null),
        fetch("/api/settings/permissions").then((r) => r.json()).catch(() => null),
      ]);
      // 每个区域只根据自己的接口结果决定是否清空，
      // 权限拉失败不应把已取到的角色列表抹掉，反之亦然
      if (rRes?.success) setRoles(rRes.data);
      else {
        setRoles([]);
        setRolesFailed(true);
      }
      if (pRes?.success) setPermissions(pRes.data);
      else {
        setPermissions([]);
        setPermsFailed(true);
      }
      if (!rRes?.success || !pRes?.success) {
        const problems: string[] = [];
        if (!rRes?.success) problems.push(`角色列表：${rRes?.error || "请求未成功"}`);
        if (!pRes?.success) problems.push(`权限清单：${pRes?.error || "请求未成功"}`);
        setError(`部分数据加载失败 —— ${problems.join("；")}`);
      }
    } catch {
      // 走到这里说明两个接口之外出了意外，分不清具体哪一半，两边都标记为未知
      setRoles([]);
      setPermissions([]);
      setRolesFailed(true);
      setPermsFailed(true);
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
    if (!name || !displayName) {
      setCreateError("角色标识与显示名都是必填项");
      return;
    }
    setSubmitting(true);
    setCreateError("");
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
      } else {
        setCreateError(json.error || "创建失败，角色未创建");
      }
    } catch {
      setCreateError("网络错误，角色未创建");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <SectionTitle
        title="角色与权限"
        description="角色是一组权限的集合，成员通过被授予角色获得权限。权限用「资源:动作」表示，例如 agent:update 表示可以修改 Agent 配置。新建的角色默认不带任何权限，需要另行分配。"
        actions={
          <Button
            variant="primary"
            onClick={() => setShowCreate(!showCreate)}
            aria-expanded={showCreate}
            aria-controls="create-role-form"
            title={showCreate ? "收起新建表单" : "展开表单，创建一个新角色"}
          >
            + 新建角色
          </Button>
        }
      />

      {error && (
        <Alert
          tone="danger"
          title="角色或权限数据加载失败"
          className="mt-4"
          onRetry={fetchData}
          retryHint="点这里会重新拉一次角色与权限，两个接口一起重试。"
        >
          {error}
          <span className="mt-1 block text-xs">
            下方列表可能不完整，请勿据此判断某个角色「没有权限」。刷新页面后重试。
          </span>
        </Alert>
      )}

      {showCreate && (
        <div
          id="create-role-form"
          className="mt-4 rounded-md bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]"
        >
          <p className="text-[13px] leading-relaxed text-[var(--muted)]">
            角色标识用于接口与策略引用，建议全小写加连字符且创建后不再更改；显示名是界面上给人看的名字。
            角色创建后先是空壳，要到权限分配里勾选具体的「资源:动作」才会真正生效。
          </p>
          {createError && (
            <Alert tone="danger" title="创建未完成" className="mt-3">
              {createError}
            </Alert>
          )}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field
              label="角色标识"
              required
              hint="程序内使用，例如 agent-reviewer"
              className="sm:w-56"
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="角色标识"
                />
              )}
            </Field>
            <Field
              label="显示名"
              required
              hint="界面展示，例如 配置审批人"
              className="sm:w-56"
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="显示名"
                />
              )}
            </Field>
            <Button
              variant="primary"
              onClick={handleCreate}
              loading={submitting}
              loadingText="创建中…"
              className="sm:mb-[2px]"
            >
              创建
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-4 space-y-2" role="status" aria-live="polite">
          <span className="sr-only">正在加载角色与权限数据</span>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Roles list */}
          <section aria-labelledby="roles-list-heading">
            <h3
              id="roles-list-heading"
              className="mb-1 text-sm font-semibold text-[var(--foreground)]"
            >
              角色列表
            </h3>
            <CountLine
              className="mb-2"
              error={rolesFailed}
              unknown="角色数据这次没能取到，下面的数量与列表都不代表实际配置。"
            >
              共 {roles.length} 个角色。标有「系统」的是平台内置角色，其权限组合不建议改动，删除后可能导致部分流程无人可审批。
              每个角色下方的小标签就是它当前持有的权限，悬停可看这条权限具体允许什么。
            </CountLine>
            {roles.length === 0 && !rolesFailed ? (
              <EmptyState
                title="暂无角色"
                description="还没有定义任何角色。可以先建一个角色，再为它分配权限，最后把成员加入该角色。"
              />
            ) : (
              <ul className="space-y-2">
                {roles.map((r) => (
                  <li key={r.id} className="rounded-md bg-[var(--surface)] p-3 ring-1 ring-[var(--border)]">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="min-w-0 font-medium text-[var(--foreground)]">
                        {r.displayName}
                      </h4>
                      <div className="flex shrink-0 items-center gap-2">
                        {r.isSystem && (
                          <Badge
                            tone="warn"
                            title="平台内置角色：由系统预置，权限组合不建议改动，也不应删除"
                          >
                            系统
                          </Badge>
                        )}
                        <span
                          className="text-xs tabular-nums text-[var(--muted)]"
                          title="当前被授予这个角色的成员数量"
                        >
                          {r._count.members} 成员
                        </span>
                      </div>
                    </div>
                    <p
                      className="mt-0.5 cursor-help font-mono text-xs text-[var(--muted)]"
                      title="角色标识：接口与权限策略引用这个角色时使用"
                    >
                      {r.name}
                    </p>
                    {r.permissions.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <span className="sr-only">持有的权限：</span>
                        {r.permissions.map((rp) => (
                          <span
                            key={rp.permission.id}
                            title={permissionTitle(rp.permission.resource, rp.permission.action)}
                            className="cursor-help rounded bg-[var(--surface-elevated)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--foreground)]"
                          >
                            {rp.permission.resource}:{rp.permission.action}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--warn)]">
                        尚未分配任何权限 —— 被授予这个角色的成员目前什么都做不了。
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Permissions list */}
          <section aria-labelledby="permissions-list-heading">
            <h3
              id="permissions-list-heading"
              className="mb-1 text-sm font-semibold text-[var(--foreground)]"
            >
              权限列表 {permsFailed ? "（本次未取到）" : `(${permissions.length})`}
            </h3>
            <p className="mb-2 text-xs leading-relaxed text-[var(--muted)]">
              这是平台支持的全部权限项，格式为「资源:动作」—— 冒号前是作用对象，冒号后是允许的操作。
              右侧数字表示当前有多少个角色持有它；为 0 说明这条权限还没被任何角色使用。
              权限项由平台预置，不能在此新增，只能分配给角色。悬停任一条可看它具体允许什么。
            </p>
            <div className="max-h-96 divide-y divide-[var(--border)] overflow-y-auto rounded-md bg-[var(--surface)] ring-1 ring-[var(--border)]">
              {permissions.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                  title={permissionTitle(p.resource, p.action)}
                >
                  <span className="min-w-0 truncate font-mono text-sm text-[var(--foreground)]">
                    {p.resource}:{p.action}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">
                    {p._count.roles} 角色
                  </span>
                </div>
              ))}
              {permissions.length === 0 && !permsFailed && (
                <p className="p-4 text-center text-sm text-[var(--muted)]">
                  暂无权限
                  <span className="mt-1 block text-xs">
                    权限项通常由平台初始化时预置。列表为空时角色无法被赋予任何能力，请检查后端初始化是否完成。
                  </span>
                </p>
              )}
              {/* 取不到时也要在这块区域里说一句：否则只剩一个带边框的空盒，
                  会被当成「平台没有预置权限」，上方角色列表里的权限标签也就失去了对照物 */}
              {permissions.length === 0 && permsFailed && (
                <p className="p-4 text-center text-sm text-[var(--muted)]">
                  权限清单本次没能取到
                  <span className="mt-1 block text-xs">
                    这不是「平台没有预置权限」，也无法据此判断角色缺少哪些权限；上方角色列表里已有的权限标签不受影响。
                    点列表上方的「重试」可重新拉取两个接口。
                  </span>
                </p>
              )}
            </div>
          </section>
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

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/settings/audit-logs?page=${page}&pageSize=${AUDIT_PAGE_SIZE}`);
      const json = await res.json();
      if (json.success) setLogs(json.data.items);
      else {
        // 失败时清空：留着上一页的旧记录继续显示，会让分页说明（本页不满一整页就是到底）
        // 和表格内容一起变成假话
        setLogs([]);
        setError(json.error || "加载失败");
      }
    } catch {
      setLogs([]);
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [page]);

  // 翻页时同步重置 loading/error 是有意的；setState 均在 await 前完成，无级联风险
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 本页不足一整页说明已经到底，据此禁用「下一页」，避免翻进空白页
  const isLastPage = logs.length < AUDIT_PAGE_SIZE;

  return (
    <div>
      <SectionTitle
        title="审计日志"
        description="平台上的敏感动作都会在这里留痕：谁、在什么时候、对哪个资源做了什么。日志只追加、不可编辑也不可删除，用于事后追溯与责任界定。"
      />
      <Hint className="mt-2">
        「操作」列是动作码（悬停可看含义），「资源」列的格式是「资源类型:资源 ID」，可据此定位到具体对象。
        时间按你所在时区显示。每页 {AUDIT_PAGE_SIZE} 条，按发生时间从新到旧排列。
      </Hint>

      {error && (
        <Alert
          tone="danger"
          title="审计日志加载失败"
          className="mt-4"
          onRetry={fetchLogs}
          retryHint="点这里只重新拉当前这一页，不会跳回第一页。"
        >
          {error}
          <span className="mt-1 block text-xs">
            加载失败不代表没有日志。日志本身仍完整保存在服务端，请稍后重试。
          </span>
        </Alert>
      )}

      {/* 出错时既不渲染空表格也不渲染「暂无审计日志」：两者都会把「这次没取到」说成
          「一条都没有」；而且失败不会清空 logs，表格里还可能留着上一页的旧记录，
          叠加 isLastPage（空数组必然小于一页容量）甚至会声称「已是最后一页」。
          上面的 Alert 已负责说明与重试。 */}
      {loading ? (
        <div className="mt-4 space-y-2" role="status" aria-live="polite">
          <span className="sr-only">正在加载审计日志</span>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </div>
      ) : error ? null : logs.length === 0 ? (
        <EmptyState
          className="mt-4"
          title="暂无审计日志"
          description={
            page > 1
              ? "这一页已经没有记录了 —— 说明你已经翻到最后。点「上一页」回到有内容的位置。"
              : "还没有产生任何需要留痕的动作。发布配置、回滚版本、审批通过或驳回等操作都会在这里生成一条记录。"
          }
          action={
            page > 1 ? (
              <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                上一页
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="mt-4 overflow-hidden rounded-md bg-[var(--surface)] ring-1 ring-[var(--border)]">
          <div
            className="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]"
            tabIndex={0}
            role="region"
            aria-label="审计日志表格，窄屏下可左右滚动查看完整列"
          >
            <table className="w-full text-sm">
              <caption className="sr-only">
                审计日志，第 {page} 页，共 {logs.length} 条记录，列依次为操作、资源、用户、时间
              </caption>
              <thead className="bg-[var(--surface-elevated)] text-left">
                <tr>
                  <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-[var(--foreground)]">
                    操作
                  </th>
                  <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-[var(--foreground)]">
                    资源
                  </th>
                  <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-[var(--foreground)]">
                    用户
                  </th>
                  <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-[var(--foreground)]">
                    时间
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--surface-elevated)]">
                    <td
                      className="cursor-help px-4 py-3 font-mono font-medium whitespace-nowrap text-[var(--foreground)]"
                      title={AUDIT_ACTION_HELP[log.action] ?? "该动作码尚未登记说明，含义请参考对应资源的操作记录"}
                    >
                      {log.action}
                    </td>
                    <td
                      className="cursor-help px-4 py-3 font-mono text-[var(--muted)]"
                      title={`${RESOURCE_HELP[log.resource] ?? `${log.resource} 资源`}；冒号后是这条记录的资源 ID`}
                    >
                      {log.resource}:{log.resourceId}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[var(--foreground)]" title="执行这次操作的人">
                      {log.userName}
                    </td>
                    <td
                      className="px-4 py-3 whitespace-nowrap tabular-nums text-[var(--muted)]"
                      title="操作发生的时间，按你所在时区显示"
                    >
                      {new Date(log.createdAt).toLocaleString("zh-CN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav
            aria-label="审计日志分页"
            className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3"
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              title={page <= 1 ? "已经是第一页" : "回到上一页（时间更新的记录）"}
            >
              上一页
            </Button>
            <span className="text-xs tabular-nums text-[var(--muted)]" aria-live="polite">
              第 {page} 页
              {isLastPage && <span className="ml-1">（已是最后一页）</span>}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={isLastPage}
              title={isLastPage ? "本页记录不足一整页，后面没有更多日志了" : "查看下一页（时间更早的记录）"}
            >
              下一页
            </Button>
          </nav>
        </div>
      )}
    </div>
  );
}
