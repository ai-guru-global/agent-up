"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  AGENT_STATUS,
  Alert,
  Button,
  CountLine,
  EmptyState,
  Field,
  Hint,
  InlineField,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  Textarea,
  metaOf,
} from "@/components/ui";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  status: string;
  productGroup: { id: string; name: string; displayName: string };
  _count: { feedbacks: number; releases: number; versions: number; skillBindings: number };
  updatedAt: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showCreate, setShowCreate] = useState(false);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const res = await fetch(`/api/agents?${params}`);
      const json = await res.json();
      // 失败时一并清空列表（与 wiki 的 fetchPages 一致）：本接口按 search/statusFilter 重新请求，
      // 留着上一批数据继续显示，等于把旧结果当成当前筛选条件的结果
      if (json.success) setAgents(json.data.items);
      else {
        setAgents([]);
        setError(json.error || "加载失败");
      }
    } catch {
      setAgents([]);
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  // 拉取前同步重置 loading/error 是有意的；setState 均在 await 前完成，无级联风险
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const filtered = search || statusFilter !== "ALL";

  return (
    <div>
      <PageHeader
        title="Agent 管理"
        description="管理所有 Agent 的四分区配置与发布流程"
        hint={
          <>
            每个 Agent 由 Prompt（性格与纪律）、知识（长期记忆）、工具（手）、路由（分诊台）
            四个分区组成。点进任一 Agent 可以分区编辑配置、查看版本历史、试聊验证效果。
            配置改动不会立即生效，需要经过发布审批。
          </>
        }
        actions={
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            + 新建 Agent
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field
          label="搜索 Agent"
          hideLabel
          className="flex-1"
          hint="按名称或描述模糊匹配，输入后自动筛选"
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="search"
              placeholder="搜索 Agent..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
        </Field>
        <InlineField label="状态" hint="按 Agent 的生命周期状态筛选">
          {({ id }) => (
            <Select
              id={id}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-32"
            >
              <option value="ALL">全部状态</option>
              <option value="DRAFT">草稿</option>
              <option value="ACTIVE">活跃</option>
              <option value="ARCHIVED">已归档</option>
            </Select>
          )}
        </InlineField>
      </div>

      {error && (
        <Alert
          tone="danger"
          title="Agent 列表加载失败"
          className="mt-4"
          onRetry={fetchAgents}
          retryHint="点这里会重新请求一次 /api/agents，不用刷新整个页面。"
        >
          {error}
          <span className="mt-1 block text-xs">
            列表数据来自 /api/agents，由服务端从 PostgreSQL 实时读取。
            请确认本地数据库可用，然后重试。
          </span>
        </Alert>
      )}

      {loading ? (
        <div className="mt-6 space-y-3" role="status" aria-live="polite">
          <span className="sr-only">正在加载 Agent 列表</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[104px] rounded-lg" />
          ))}
        </div>
      ) : agents.length === 0 && !error ? (
        <EmptyState
          className="mt-8"
          title="暂无 Agent"
          description={
            filtered
              ? "当前筛选条件下没有匹配的 Agent。可以清空搜索词或把状态改回「全部状态」再看一次。"
              : "还没有创建任何 Agent。Agent 是平台的核心对象，反馈、发布、版本都挂在它下面。"
          }
          action={
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              创建第一个 Agent
            </Button>
          }
          hint="创建时需要指定所属产品组，用于划分权限范围与统计口径。"
        />
      ) : (
        <>
          <CountLine
            className="mt-6"
            error={!!error}
            unknown="Agent 数量这次没能取到 —— 上面是加载失败，不代表一个 Agent 都没有。"
          >
            共 {agents.length} 个 Agent{filtered ? "（已按当前筛选条件过滤）" : ""}。
            每行末尾的三个数字分别是累计反馈数、已生成的版本快照数、已绑定的 Skill 数。
          </CountLine>
          {/* 加载失败时连列表容器也不渲染。不只是因为空容器会看着像页面坏了，
              更因为 fetchAgents 是按 search/statusFilter 重新请求的：换筛选条件时一旦请求失败，
              agents 里留的是上一批（并未按当前条件过滤）的结果，继续展示就是把旧数据当成搜索结果。
              取不到的东西不报数也不列明细，上面的 CountLine 已经把状态说清楚 */}
          {agents.length > 0 && !error && (
          <ul className="mt-2 divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)]">
            {agents.map((agent) => (
              <li key={agent.id}>
                <Link
                  href={`/agents/${agent.id}/`}
                  className="block bg-[var(--surface)] p-5 transition-colors hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-[var(--foreground)]">
                          {agent.name}
                        </h2>
                        <StatusBadge dict={AGENT_STATUS} code={agent.status} />
                      </div>
                      {agent.description && (
                        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                          {agent.description}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm text-[var(--muted)]" data-numeric>
                        <time dateTime={agent.updatedAt} title="配置最后一次改动的时间">
                          {new Date(agent.updatedAt).toLocaleDateString("zh-CN")}
                        </time>
                      </div>
                      <div className="text-[11px] text-[var(--subtle)]">最后更新</div>
                    </div>
                  </div>
                  <div
                    className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--subtle)]"
                    data-numeric
                  >
                    {agent.productGroup?.displayName ? (
                      <span title="该 Agent 所属的产品组，决定权限范围与统计口径">
                        {agent.productGroup.displayName}
                      </span>
                    ) : (
                      <span title="这个 Agent 没有归属的产品组，或它原本归属的产品组已被删除；未分组的 Agent 不会出现在按产品组的统计与权限范围里，建议到设置页补上归属">
                        未分组
                      </span>
                    )}
                    <span title="累计收到的反馈条数">{agent._count?.feedbacks ?? 0} 反馈</span>
                    <span title="已生成的不可变版本快照数量，可用于回滚">
                      {agent._count?.versions ?? 0} 版本
                    </span>
                    <span title="已绑定的可复用技能组件数量">
                      {agent._count?.skillBindings ?? 0} Skills
                    </span>
                    <span className="text-[var(--subtle)]" title={metaOf(AGENT_STATUS, agent.status).desc}>
                      {metaOf(AGENT_STATUS, agent.status).desc}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          )}
        </>
      )}

      <CreateAgentModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); fetchAgents(); }}
      />
    </div>
  );
}

interface ProductGroup {
  id: string;
  displayName: string;
  description?: string | null;
}

function CreateAgentModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [productGroupId, setProductGroupId] = useState("");
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  // 产品组原先要求手填 ID，用户无从得知有哪些可选值，这里改为从接口拉取
  useEffect(() => {
    if (!open) return;
    fetch("/api/settings/product-groups")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setGroups(json.data?.items ?? json.data ?? []);
      })
      .catch(() => {
        /* 拉取失败时下方仍可手动输入 ID，不阻断创建 */
      });
  }, [open]);

  const handleSubmit = async () => {
    if (!name || !productGroupId) { setErr("请填写必要字段"); return; }
    setSubmitting(true);
    setErr("");
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
    <Modal
      open={open}
      onClose={onClose}
      title="新建 Agent"
      description="新建后状态为「草稿」，不会对外提供服务；四分区配置在详情页继续填写。"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
            loadingText="创建中..."
          >
            创建
          </Button>
        </>
      }
    >
      {err && (
        <Alert tone="danger" title="创建失败" className="mb-4">
          {err}
        </Alert>
      )}

      <div className="space-y-4">
        <Field label="名称" required hint="展示在列表与反馈记录里的名字，建议写成「产品 + 用途」，例如 ECS 助手">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ECS 助手"
            />
          )}
        </Field>

        <Field
          label="描述"
          hint="一句话说明这个 Agent 服务谁、解决什么问题。可留空，之后在详情页补。"
        >
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          )}
        </Field>

        {groups.length > 0 ? (
          <Field
            label="产品组"
            required
            hint="即产品组 ID，决定这个 Agent 的权限范围与统计口径，创建后不建议变更。"
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={productGroupId}
                onChange={(e) => setProductGroupId(e.target.value)}
              >
                <option value="">请选择产品组</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.displayName}（{g.id}）
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <Field
            label="产品组 ID"
            required
            hint="没能读取到产品组列表，请手动填写 ID。演示数据里可用 ecs-group 或 rds-group。"
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={productGroupId}
                onChange={(e) => setProductGroupId(e.target.value)}
                placeholder="输入产品组 ID"
              />
            )}
          </Field>
        )}
      </div>

      <Hint className="mt-4 border-t border-[var(--border)] pt-3">
        创建动作会立即写入数据库（PostgreSQL），但不会触发任何对外发布。
      </Hint>
    </Modal>
  );
}
