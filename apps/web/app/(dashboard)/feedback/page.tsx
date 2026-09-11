"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Card,
  CountLine,
  EmptyState,
  FEEDBACK_STATUS,
  Field,
  Hint,
  InlineField,
  Input,
  Modal,
  PARTITION,
  FEEDBACK_TAG_HELP,
  PageHeader,
  RATING,
  SEVERITY,
  Select,
  Skeleton,
  StatusBadge,
  Textarea,
  metaOf,
  tagHelp,
} from "@/components/ui";

interface Feedback {
  id: string;
  title: string;
  content: string;
  status: string;
  severity: string;
  rating: string;
  tags: string[];
  submittedAt: string;
  /** 关联的 Agent。若该 Agent 已被删除，服务端会返回 null，界面需要能兜住 */
  agent: { id: string; name: string } | null;
  targetPartition: string | null;
  resolution: string | null;
  /** 反馈来源渠道：MANUAL（web 表单/插件）或机器接入渠道（generic / ticket-webhook，R5b） */
  source?: string;
  /** 机器接入的外部单号（多渠道工单适配器写入） */
  externalRef?: { id: string | null; url: string | null } | null;
}

interface AgentOption {
  id: string;
  name: string;
}

const STATUS_OPTS = ["ALL","NEW","TRIAGED","ASSIGNED","IN_PROGRESS","RESOLVED","VERIFIED","CLOSED","WONTFIX"];
const SEVERITY_OPTS = ["ALL","CRITICAL","MAJOR","MINOR","SUGGESTION"];

const NEXT_STATUS: Record<string, string[]> = {
  NEW: ["TRIAGED", "WONTFIX"],
  TRIAGED: ["ASSIGNED", "WONTFIX"],
  ASSIGNED: ["IN_PROGRESS", "WONTFIX"],
  IN_PROGRESS: ["RESOLVED", "WONTFIX"],
  RESOLVED: ["VERIFIED", "IN_PROGRESS"],
  VERIFIED: ["CLOSED"],
  CLOSED: [],
  WONTFIX: [],
};

export default function FeedbackPage() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [showCreate, setShowCreate] = useState(false);
  /** 正在流转状态的反馈 id，避免同一条被连点两次 */
  const [moving, setMoving] = useState<string | null>(null);
  const [moveError, setMoveError] = useState("");
  // AI 归因：feedbackId -> { loading, text, error }
  const [insights, setInsights] = useState<Record<string, { loading: boolean; text: string; error: string }>>({});

  const handleInsight = async (id: string) => {
    setInsights((m) => ({ ...m, [id]: { loading: true, text: "", error: "" } }));
    try {
      const res = await fetch(`/api/feedback/${id}/insight`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setInsights((m) => ({ ...m, [id]: { loading: false, text: json.data.insight, error: "" } }));
      } else {
        setInsights((m) => ({ ...m, [id]: { loading: false, text: "", error: json.error || "归因失败" } }));
      }
    } catch {
      setInsights((m) => ({ ...m, [id]: { loading: false, text: "", error: "网络错误" } }));
    }
  };

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams();
      if (statusFilter !== "ALL") p.set("status", statusFilter);
      if (severityFilter !== "ALL") p.set("severity", severityFilter);
      const res = await fetch(`/api/feedback?${p}`);
      const json = await res.json();
      // 失败时一并清空列表（与 wiki 的 fetchPages 一致）：本接口按筛选条件重新请求，
      // 留着上一批数据继续显示，等于把旧结果当成当前筛选条件的结果
      if (json.success) setItems(json.data.items);
      else {
        setItems([]);
        setError(json.error || "加载失败");
      }
    } catch {
      setItems([]);
      setError("网络错误");
    } finally { setLoading(false); }
  }, [statusFilter, severityFilter]);

  // 拉取前同步重置 loading/error 是有意的；setState 均在 await 前完成，无级联风险
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchList(); }, [fetchList]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    setMoving(id);
    setMoveError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      const json = await res.json();
      if (json.success === false) {
        setMoveError(json.error || "状态流转失败");
      }
      fetchList();
    } catch {
      setMoveError("网络错误");
    } finally {
      setMoving(null);
    }
  };

  const filtered = statusFilter !== "ALL" || severityFilter !== "ALL";

  return (
    <div>
      <PageHeader
        title="反馈中心"
        description="收集、跟踪和处理 Agent 的用户反馈"
        hint={
          <>
            反馈是整个改进环的输入。一条反馈的完整生命周期是：
            待分诊 → 已分诊 → 已指派 → 处理中 → 已解决 → 已验证 → 已关闭；
            确认属于预期行为或超出能力边界时，任一环节都可以直接标记为「不予处理」。
            分诊时最关键的一步是判断该改哪个分区 —— 是提示词没说清（Prompt）、知识库没这条料（知识）、
            缺少可调用的动作（工具），还是本该转人工（路由）。
          </>
        }
        actions={
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            + 录入反馈
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <InlineField label="状态" hint="按处理流转阶段筛选">
          {({ id }) => (
            <Select
              id={id}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-44"
            >
              {STATUS_OPTS.map((s) => (
                <option key={s} value={s}>
                  {s === "ALL" ? "全部状态" : `${metaOf(FEEDBACK_STATUS, s).label}（${s}）`}
                </option>
              ))}
            </Select>
          )}
        </InlineField>
        <InlineField label="严重程度" hint="按影响面与紧急度筛选">
          {({ id }) => (
            <Select
              id={id}
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-40"
            >
              {SEVERITY_OPTS.map((s) => (
                <option key={s} value={s}>
                  {s === "ALL" ? "全部严重程度" : `${metaOf(SEVERITY, s).label}（${s}）`}
                </option>
              ))}
            </Select>
          )}
        </InlineField>
      </div>

      {error && (
        <Alert
          tone="danger"
          title="反馈列表加载失败"
          className="mt-4"
          onRetry={fetchList}
          retryHint="点这里会重新请求一次 /api/feedback，筛选条件不会被重置。"
        >
          {error}
          <span className="mt-1 block text-xs">
            列表数据来自 /api/feedback，由服务端从 PostgreSQL 实时读取。
            请确认本地数据库可用，然后重试。
          </span>
        </Alert>
      )}

      {moveError && (
        <Alert tone="danger" title="状态未能流转" className="mt-4">
          {moveError}
          <span className="mt-1 block text-xs">
            这条反馈仍保持原状态。可以刷新页面确认当前状态后再试一次。
          </span>
        </Alert>
      )}

      {loading ? (
        <div className="mt-8 space-y-3" role="status" aria-live="polite">
          <span className="sr-only">正在加载反馈列表</span>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        <EmptyState
          className="mt-8"
          title="暂无反馈记录"
          description={
            filtered
              ? "当前筛选条件下没有匹配的反馈。可以把状态与严重程度都改回「全部」再看一次。"
              : "还没有任何反馈。反馈是改进环的起点：先录入一条真实的对话问题，再归因到分区、改配置、提交审批。"
          }
          action={
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              录入第一条反馈
            </Button>
          }
          hint="录入时至少要选一个 Agent 并写清标题与详细内容，其余字段可以在分诊阶段再补。"
        />
      ) : (
        <>
          <CountLine
            className="mt-6"
            error={!!error}
            unknown="反馈条数这次没能取到 —— 上面是加载失败，不代表一条反馈都没有。"
          >
            共 {items.length} 条反馈{filtered ? "（已按当前筛选条件过滤）" : ""}。
            每条右侧是可执行的下一步状态，按钮上的箭头表示流转方向；
            悬停任一状态徽章可以看到该状态的判定标准。评价为「负面」的反馈会额外出现「AI 归因」按钮。
          </CountLine>
          {/* 标签释义图例：title 悬浮在触屏上不可用，下面这份对照表是它的兜底；
              文字直接取自 FEEDBACK_TAG_HELP，与悬浮提示共用同一个事实源 */}
          {(() => {
            const tags = [...new Set(items.flatMap((f) => f.tags ?? []))].sort();
            if (tags.length === 0) return null;
            return (
              <div className="mt-3 rounded-md border border-dashed border-[var(--border)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  当前列表里的标签含义
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--subtle)]">
                  标签是人工自由填写的分类标记，用来把同类问题聚在一起看；
                  宽屏下悬停标签也能看到同样的说明，窄屏没有悬停时以这份对照为准。
                </p>
                <dl className="mt-2 space-y-1.5 text-xs leading-relaxed text-[var(--muted)]">
                  {tags.map((t) => (
                    <div key={t}>
                      <dt className="inline font-mono font-medium text-[var(--foreground)]">{t}：</dt>{" "}
                      <dd className="inline">
                        {FEEDBACK_TAG_HELP[t] ?? "人工自定义的标记，没有预置释义，具体含义以团队约定为准"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })()}
          <ul className="mt-2 space-y-3">
            {items.map((fb) => {
              const nexts = NEXT_STATUS[fb.status] || [];
              const busy = moving === fb.id;
              return (
                <li key={fb.id}>
                  <Card pad="md">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold text-[var(--foreground)]">{fb.title}</h2>
                          <StatusBadge dict={FEEDBACK_STATUS} code={fb.status} />
                          <StatusBadge dict={SEVERITY} code={fb.severity} />
                          {fb.rating && (
                            <Badge
                              tone={metaOf(RATING, fb.rating).tone}
                              title={metaOf(RATING, fb.rating).desc}
                              code={fb.rating}
                            >
                              {metaOf(RATING, fb.rating).label}
                            </Badge>
                          )}
                          {fb.source && fb.source !== "MANUAL" && (
                            <Badge
                              tone="accent"
                              title={
                                fb.externalRef?.id
                                  ? `由工单系统经多渠道适配器（${fb.source}）自动接入，外部单号 ${fb.externalRef.id}`
                                  : `由外部系统经多渠道适配器（${fb.source}）自动接入`
                              }
                            >
                              渠道 {fb.source}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-[var(--muted)]" title={fb.content}>
                          {fb.content}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--subtle)]">
                          <span title="这条反馈针对哪个 Agent">
                            Agent:{" "}
                            {fb.agent ? (
                              <Link
                                href={`/agents/${fb.agent.id}/`}
                                className="rounded text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                              >
                                {fb.agent.name}
                              </Link>
                            ) : (
                              <span title="这条反馈关联的 Agent 已不存在，可能已被删除；反馈本身仍保留以便追溯">
                                已删除的 Agent
                              </span>
                            )}
                          </span>
                          {fb.targetPartition && (
                            <span
                              className="cursor-help"
                              title={
                                PARTITION[fb.targetPartition]
                                  ? `${PARTITION[fb.targetPartition].label}（${PARTITION[fb.targetPartition].role}）：${PARTITION[fb.targetPartition].desc}`
                                  : "分诊时判定的归因分区"
                              }
                            >
                              分区: {PARTITION[fb.targetPartition]
                                ? `${PARTITION[fb.targetPartition].label}（${fb.targetPartition}）`
                                : fb.targetPartition}
                            </span>
                          )}
                          <time
                            dateTime={fb.submittedAt}
                            className="tabular-nums"
                            title="反馈提交时间"
                          >
                            {new Date(fb.submittedAt).toLocaleDateString("zh-CN")}
                          </time>
                        </div>
                        {fb.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            <span className="sr-only">标签（鼠标悬停可看到每个标签的含义，列表上方也有完整对照表）：</span>
                            {fb.tags.map((t) => (
                              <span
                                key={t}
                                title={tagHelp(t)}
                                className="cursor-help rounded bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--muted)]"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5 sm:flex-col sm:items-stretch">
                        {fb.rating === "NEGATIVE" && (
                          <button
                            onClick={() => handleInsight(fb.id)}
                            disabled={insights[fb.id]?.loading}
                            title="调用模型阅读这条反馈，给出可能的归因分区与改进建议。结果仅供参考，需要人工确认后再动配置。"
                            className="whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium text-[var(--success)] ring-1 ring-[var(--success-border)] transition-colors hover:bg-[var(--success-bg)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {insights[fb.id]?.loading ? "分析中…" : "AI 归因"}
                          </button>
                        )}
                        {nexts.length === 0 ? (
                          <span className="whitespace-nowrap text-[11px] text-[var(--subtle)]">
                            流程已终结，无后续状态
                          </span>
                        ) : (
                          nexts.map((ns) => (
                            <button
                              key={ns}
                              onClick={() => handleStatusChange(fb.id, ns)}
                              disabled={busy}
                              title={`流转为「${metaOf(FEEDBACK_STATUS, ns).label}」：${metaOf(FEEDBACK_STATUS, ns).desc}`}
                              className="whitespace-nowrap rounded-md px-2.5 py-1 text-xs text-[var(--muted)] ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <span aria-hidden="true">→ </span>
                              {metaOf(FEEDBACK_STATUS, ns).label}
                              <span className="ml-1 font-mono text-[10px] opacity-75">（{ns}）</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>

                    {insights[fb.id]?.text && (
                      <div className="mt-3 whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-[13px] leading-relaxed text-[var(--foreground)]">
                        <Badge tone="success" className="mr-2" title="由模型生成的归因分析，非人工结论">
                          AI 归因
                        </Badge>
                        {insights[fb.id].text}
                        <p className="mt-2 text-[11px] text-[var(--subtle)]">
                          以上为模型的推测性分析，用于缩小排查范围；改配置前请人工核对，归因结论以你在分诊时选定的目标分区为准。
                        </p>
                      </div>
                    )}
                    {insights[fb.id]?.error && (
                      <Alert tone="danger" title="AI 归因未完成" className="mt-3">
                        {insights[fb.id].error}
                        <span className="mt-1 block text-xs">
                          归因依赖模型服务。可以到「模型服务」页做一次连通性探测，确认凭据可用后再重试。
                        </span>
                      </Alert>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <CreateFeedbackModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); fetchList(); }}
      />
    </div>
  );
}

function CreateFeedbackModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  // Agent 选项这次「没取到」的标记。agentId 是必填且决定归因口径，
  // 取不到选项时不能让用户面对一个空下拉猜原因，更不能降级成手填 ID（极易填错）
  const [optsFailed, setOptsFailed] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [rating, setRating] = useState<"POSITIVE" | "NEGATIVE" | "NEUTRAL">("NEUTRAL");
  const [severity, setSeverity] = useState<"CRITICAL" | "MAJOR" | "MINOR" | "SUGGESTION">("MINOR");
  const [targetPartition, setTargetPartition] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  // 失败时清空选项列表（与列表页 fetchList 一致）：重试再失败时不能拿上一次的结果当当前选项。
  // 抽成函数是为了 warn 提示里的「重试」可以直接调用它
  const loadAgentOptions = useCallback(async () => {
    setOptsFailed(false);
    try {
      const r = await fetch("/api/agents");
      const j = await r.json();
      if (j.success) setAgents(j.data.items);
      else {
        setAgents([]);
        setOptsFailed(true);
      }
    } catch {
      setAgents([]);
      setOptsFailed(true);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { loadAgentOptions(); }, [loadAgentOptions]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = async () => {
    if (!agentId || !title || !content) { setErr("请填写必要字段"); return; }
    setSubmitting(true);
    setErr("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId, title, content, rating, severity,
          targetPartition: targetPartition || null,
        }),
      });
      const json = await res.json();
      if (json.success) onCreated();
      else setErr(json.error);
    } catch { setErr("网络错误"); }
    finally { setSubmitting(false); }
  };

  const partitionMeta = targetPartition ? PARTITION[targetPartition] : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="录入反馈"
      description="把一次不满意的对话固化成可跟踪的改进项。录入后状态为「待分诊」，等待判定归属与优先级。"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
            loadingText="提交中..."
          >
            提交
          </Button>
        </>
      }
    >
      {err && (
        <Alert tone="danger" title="提交未成功" className="mb-4">
          {err}
          <span className="mt-1 block text-xs">
            已填写的内容仍保留在下方，补齐后可直接重新提交。
          </span>
        </Alert>
      )}

      <div className="space-y-4">
        {/* 失败时下拉只剩占位项，这里必须把原因说明白：选项没加载出来 ≠ 平台上没有 Agent */}
        {optsFailed && (
          <Alert
            tone="warn"
            title="Agent 列表本次没能取到"
            className="mb-1"
            onRetry={loadAgentOptions}
            retryHint="点这里会重新拉一次选项；重试成功后下方下拉即可正常选择。"
          >
            下拉里没有可选的 Agent，是因为选项没加载出来，不是平台上一个 Agent 都没有。
            <span className="mt-1 block text-xs">
              列表加载出来之前建议先不要提交 —— 这条反馈的归因必须落在真实存在的 Agent 上，选错对象会让后续统计口径错位。
            </span>
          </Alert>
        )}
        <Field
          label="Agent *"
          hint="这条反馈针对哪个 Agent。选错会导致统计口径和归因都落到错误的对象上，提交后不便修改。"
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              <option value="">选择 Agent...</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          )}
        </Field>

        <Field
          label="标题 *"
          hint="一句话概括问题现象，便于在列表里快速识别。建议写「什么场景下答错了什么」，而不是「回答不好」。"
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="简要描述反馈内容"
            />
          )}
        </Field>

        <Field
          label="详细内容 *"
          hint="尽量贴上原始问法与 Agent 的原始回答，并写清期望的正确回答。这些原文是后续归因、改语料与验证效果的唯一依据。"
        >
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="详细描述问题或建议..."
            />
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="评价"
            hint={
              <>
                {metaOf(RATING, rating).desc}
                {rating === "NEGATIVE" && (
                  <span className="mt-0.5 block">选「负面」后，列表里会出现「AI 归因」按钮。</span>
                )}
              </>
            }
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={rating}
                onChange={(e) => setRating(e.target.value as "POSITIVE" | "NEGATIVE" | "NEUTRAL")}
              >
                <option value="POSITIVE">正面</option>
                <option value="NEGATIVE">负面</option>
                <option value="NEUTRAL">中性</option>
              </Select>
            )}
          </Field>
          <Field
            label="严重程度"
            hint={metaOf(SEVERITY, severity).desc}
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={severity}
                onChange={(e) => setSeverity(e.target.value as "CRITICAL" | "MAJOR" | "MINOR" | "SUGGESTION")}
              >
                <option value="CRITICAL">严重</option>
                <option value="MAJOR">重要</option>
                <option value="MINOR">次要</option>
                <option value="SUGGESTION">建议</option>
              </Select>
            )}
          </Field>
        </div>

        <Field
          label="目标分区"
          hint={
            partitionMeta ? (
              <>
                {partitionMeta.label}（{partitionMeta.role}）：{partitionMeta.desc}
              </>
            ) : (
              "还判断不出该改哪里时可以留空，交给分诊阶段再定。四个分区分别对应：提示词没说清（Prompt）、知识库缺料（Knowledge）、缺少可调动作（Tools）、本该转人工（Routing）。"
            )
          }
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={targetPartition}
              onChange={(e) => setTargetPartition(e.target.value)}
            >
              <option value="">未指定</option>
              <option value="PROMPT">Prompt（提示词·性格与纪律）</option>
              <option value="KNOWLEDGE">Knowledge（知识·长期记忆）</option>
              <option value="TOOLS">Tools（工具·能做的动作）</option>
              <option value="ROUTING">Routing（路由·分诊台）</option>
            </Select>
          )}
        </Field>

        <Hint className="border-t border-[var(--border)] pt-3">
          带 * 的三个字段必填。提交只是登记问题，不会改动任何配置；
          真正的修改在 Agent 详情页对应分区完成，并需要经过发布审批。
        </Hint>
      </div>
    </Modal>
  );
}
