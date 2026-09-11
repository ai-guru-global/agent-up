"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CountLine,
  EmptyState,
  Field,
  Hint,
  InlineField,
  Input,
  Modal,
  PageHeader,
  SKILL_STATUS,
  Select,
  Skeleton,
  StatusBadge,
  Textarea,
  metaOf,
} from "@/components/ui";
import type { Tone } from "@/components/ui";

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
/** 分类的 tone 与「它能做什么」的解释。此前只有色块没有释义，用户只能靠猜 */
const CAT_META: Record<string, { tone: Tone; desc: string }> = {
  KNOWLEDGE_QUERY: { tone: "info", desc: "在知识库或文档里查资料，只读不改，用来补足回答依据" },
  DATA_FETCH: { tone: "accent", desc: "调接口取实时数据，例如实例状态、账单、监控指标，只读不改" },
  ACTION: { tone: "warn", desc: "会真正改变外部状态，例如重启实例、开工单、发通知，需谨慎授权" },
  TRANSFORM: { tone: "success", desc: "对已有数据做格式转换或摘要，不外呼，纯计算" },
  GENERAL: { tone: "neutral", desc: "未归入以上任何一类的通用能力" },
};
/** 运行时决定 Skill 以什么方式被调用 */
const RUNTIME_HELP: Record<string, string> = {
  HTTP: "通过 HTTP 请求调用外部服务，需要填写 Endpoint",
  FUNCTION: "以函数形式在平台内执行，不需要外部端点",
  MCP: "以 MCP 协议暴露给模型，由模型自主决定何时调用",
  WORKFLOW: "由多个步骤编排成的流程，适合有前后依赖的复合任务",
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
      // 失败时一并清空列表（与 wiki 的 fetchPages 一致）：本接口按筛选条件重新请求，
      // 留着上一批数据继续显示，等于把旧结果当成当前筛选条件的结果
      if (json.success) setSkills(json.data.items);
      else {
        setSkills([]);
        setError(json.error || "加载失败");
      }
    } catch {
      setSkills([]);
      setError("网络错误");
    } finally { setLoading(false); }
  }, [catFilter, statusFilter, search]);

  // 拉取前同步重置 loading/error 是有意的；setState 均在 await 前完成，无级联风险
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchList(); }, [fetchList]);

  const filtered = !!search || catFilter !== "ALL" || statusFilter !== "ALL";

  return (
    <div>
      <PageHeader
        title="Skills 市场"
        description="管理和发现可复用的 Agent 技能组件"
        hint={
          <>
            Skill 是一段可复用的能力，属于四分区里的「工具」分区 —— 决定 Agent 能做什么动作。
            一个 Skill 可以被任意多个 Agent 绑定，改一次所有绑定方都受益，因此比在单个 Agent 里写死更值得。
            只有状态为「已发布」的 Skill 才会出现在 Agent 的可绑定列表中。
          </>
        }
        actions={
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            + 发布 Skill
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <Field
          label="搜索 Skill"
          hideLabel
          className="sm:w-64"
          hint="按标识名、显示名或描述模糊匹配"
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="search"
              placeholder="搜索 Skill..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
        </Field>
        <InlineField label="分类" hint="按 Skill 的能力类型筛选">
          {({ id }) => (
            <Select
              id={id}
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="w-32"
            >
              {CATS.map((c) => (
                <option key={c} value={c}>{c === "ALL" ? "全部分类" : CAT_LABEL[c] || c}</option>
              ))}
            </Select>
          )}
        </InlineField>
        <InlineField label="状态" hint="按 Skill 的生命周期状态筛选">
          {({ id }) => (
            <Select
              id={id}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-32"
            >
              <option value="ALL">全部状态</option>
              <option value="DRAFT">草稿</option>
              <option value="PUBLISHED">已发布</option>
              <option value="DEPRECATED">已弃用</option>
              <option value="ARCHIVED">已归档</option>
            </Select>
          )}
        </InlineField>
      </div>

      {error && (
        <Alert
          tone="danger"
          title="Skill 列表加载失败"
          className="mt-4"
          onRetry={fetchList}
          retryHint="点这里会重新请求一次 /api/skills，不用刷新整个页面。"
        >
          {error}
          <span className="mt-1 block text-xs">
            列表数据来自 /api/skills，由服务端从 PostgreSQL 实时读取。
            请确认本地数据库可用，然后重试。
          </span>
        </Alert>
      )}

      {loading ? (
        <div
          className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="status"
          aria-live="polite"
        >
          <span className="sr-only">正在加载 Skill 列表</span>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : skills.length === 0 && !error ? (
        <EmptyState
          className="mt-8"
          title="暂无 Skill"
          description={
            filtered
              ? "当前筛选条件下没有匹配的 Skill。可以清空搜索词，或把分类与状态都改回「全部」再看一次。"
              : "还没有发布任何 Skill。Skill 是给 Agent 用的可复用能力，先发布一个，之后就能在 Agent 的工具分区里绑定它。"
          }
          action={
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              创建第一个 Skill
            </Button>
          }
          hint="新建后默认是「草稿」状态，需要改为「已发布」才会出现在 Agent 的可绑定列表中。"
        />
      ) : (
        <>
          <CountLine
            className="mt-6"
            error={!!error}
            unknown="Skill 数量这次没能取到 —— 上面是加载失败，不代表一个 Skill 都没有。"
          >
            共 {skills.length} 个 Skill{filtered ? "（已按当前筛选条件过滤）" : ""}。
            每张卡片右上角是发布状态，中间彩色标签是能力分类，其后是运行时；
            底部左侧为当前版本号，右侧为已绑定它的 Agent 数量 —— 数字越大，改动的影响面越广。
          </CountLine>
          <ul className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((sk) => {
              const cat = CAT_META[sk.category] ?? CAT_META.GENERAL;
              return (
                <li key={sk.id}>
                  <Card pad="md" className="h-full">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="min-w-0 font-semibold text-[var(--foreground)]">
                        {sk.displayName}
                      </h2>
                      <StatusBadge dict={SKILL_STATUS} code={sk.status} className="shrink-0" />
                    </div>
                    <p className="mt-0.5 font-mono text-[11px] text-[var(--subtle)]" title="标识名：代码与 API 里引用这个 Skill 时使用的唯一名称">
                      {sk.name}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-[var(--muted)]" title={sk.description}>
                      {sk.description}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge tone={cat.tone} title={cat.desc}>
                        {CAT_LABEL[sk.category] || sk.category}
                      </Badge>
                      <span
                        className="cursor-help text-xs text-[var(--subtle)]"
                        title={RUNTIME_HELP[sk.runtime] ?? "该 Skill 的调用方式"}
                      >
                        {sk.runtime}
                      </span>
                    </div>
                    <div
                      className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2.5 text-xs text-[var(--subtle)]"
                      data-numeric
                    >
                      <span title={`当前版本号，共有 ${sk._count.versions} 个历史版本`}>v{sk.version}</span>
                      <span title="已绑定该 Skill 的 Agent 数量，改动会同时影响这些 Agent">
                        {sk._count.bindings} 个 Agent 使用
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-[var(--subtle)]">
                      {metaOf(SKILL_STATUS, sk.status).desc}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <CreateSkillModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); fetchList(); }}
      />
    </div>
  );
}

function CreateSkillModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
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
    setErr("");
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
    <Modal
      open={open}
      onClose={onClose}
      title="发布 Skill"
      description="登记一个可复用的能力组件。创建后默认为草稿状态，确认可用再改为已发布，Agent 才能绑定它。"
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
        <Alert tone="danger" title="创建未成功" className="mb-4">
          {err}
          <span className="mt-1 block text-xs">
            表单内容仍保留在下方，修正后可直接重新提交。标识名在全平台唯一，重复时会被拒绝。
          </span>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="标识名 *"
            hint="全平台唯一，建议小写加连字符。代码与 API 里引用这个 Skill 时用它，创建后不建议再改。"
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="wiki-search"
              />
            )}
          </Field>
          <Field
            label="显示名 *"
            hint="界面上给人看的名字，可用中文。列表卡片与 Agent 绑定处显示的都是它。"
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Wiki 搜索"
              />
            )}
          </Field>
        </div>

        <Field
          label="描述 *"
          hint="说清它做什么、什么时候该用、有什么限制。这段文字会随 Skill 一起提供给模型作为选择依据，写得越准，模型误用的概率越低。"
        >
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="在内部知识库中按关键词检索文档片段，用于补充回答依据；不返回实时业务数据。"
            />
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="分类"
            hint={
              <>
                按能力类型归类，影响筛选与模型的选择偏好。
                <span className="mt-0.5 block">{CAT_META[category]?.desc}</span>
              </>
            }
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATS.filter(c => c !== "ALL").map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
              </Select>
            )}
          </Field>
          <Field
            label="运行时"
            hint={
              <>
                决定这个 Skill 以什么方式被调用。
                <span className="mt-0.5 block">{RUNTIME_HELP[runtime]}</span>
              </>
            }
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={runtime}
                onChange={(e) => setRuntime(e.target.value)}
              >
                <option value="HTTP">HTTP</option>
                <option value="FUNCTION">Function</option>
                <option value="MCP">MCP</option>
                <option value="WORKFLOW">Workflow</option>
              </Select>
            )}
          </Field>
        </div>

        <Field
          label="Endpoint"
          hint={
            runtime === "HTTP"
              ? "HTTP 运行时需要填写可访问的完整地址，平台会向它转发调用请求。"
              : "当前运行时不强制要求，可留空；若该实现仍需外部地址，填在这里。"
          }
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://api.example.com/skill"
            />
          )}
        </Field>

        <Hint className="border-t border-[var(--border)] pt-3">
          带 * 的三个字段必填。创建只是登记元信息，不会立即对任何 Agent 生效；
          之后到 Agent 详情页的工具分区绑定它，再走一次发布审批才会上线。
        </Hint>
      </div>
    </Modal>
  );
}
