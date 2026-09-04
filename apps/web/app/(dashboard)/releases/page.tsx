"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  CountLine,
  EmptyState,
  Hint,
  InlineField,
  PARTITION,
  PageHeader,
  RELEASE_STATUS,
  Select,
  Skeleton,
  StatusBadge,
  metaOf,
} from "@/components/ui";

interface Release {
  id: string;
  agentId: string;
  changeNote: string;
  status: string;
  submittedAt: string;
  submittedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  reviewComment: string | null;
  changedPartitions: string[];
  /** 关联的 Agent。若该 Agent 已被删除，服务端会返回 null，界面需要能兜住 */
  agent: { id: string; name: string } | null;
  version: { id: string; version: string; publishedAt: string } | null;
}

const STATUS_OPTS = ["ALL", "PENDING", "APPROVED", "REJECTED", "CHANGES_REQUESTED"];

const PARTITION_LABELS: Record<string, string> = {
  PROMPT: "Prompt",
  KNOWLEDGE: "知识",
  TOOLS: "工具",
  ROUTING: "路由",
};

/** 某个分区在这次变更里被改动意味着什么，用于 diff 区的悬浮解释 */
function partitionTitle(code: string): string {
  const meta = PARTITION[code.toUpperCase()];
  if (!meta) return "该分区的配置在本次提交中发生了改动";
  return `${meta.label}（${meta.role}）：${meta.desc}`;
}

export default function ReleasesPage() {
  const [items, setItems] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [processing, setProcessing] = useState<string | null>(null);
  /** 审批动作的失败原因；原实现是 fire-and-forget，失败时界面毫无反应 */
  const [reviewError, setReviewError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** 待确认的审批动作。审批会生成不可变版本，必须二次确认 */
  const [pendingReview, setPendingReview] = useState<{
    release: Release;
    action: "APPROVED" | "REJECTED";
  } | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams();
      if (statusFilter !== "ALL") p.set("status", statusFilter);
      const res = await fetch(`/api/releases?${p}`);
      const json = await res.json();
      // 失败时一并清空列表（与 wiki 的 fetchPages 一致）：本接口按 statusFilter 重新请求，
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
  }, [statusFilter]);

  // 拉取前同步重置 loading/error 是有意的；setState 均在 await 前完成，无级联风险
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchList(); }, [fetchList]);

  const handleReview = async (releaseId: string, action: "APPROVED" | "REJECTED") => {
    setProcessing(releaseId);
    setReviewError("");
    try {
      const res = await fetch(`/api/releases/${releaseId}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (json.success === false) {
        setReviewError(json.error || (action === "APPROVED" ? "审批通过失败" : "驳回失败"));
      }
      fetchList();
    } catch {
      setReviewError("网络错误，审批未生效");
    } finally {
      setProcessing(null);
      setPendingReview(null);
    }
  };

  const filtered = statusFilter !== "ALL";
  const pendingCount = items.filter((r) => r.status === "PENDING").length;

  return (
    <div>
      <PageHeader
        title="发布审批"
        description="审核 Agent 配置变更并发布新版本 · 点击「查看变更」展开 diff"
        hint={
          <>
            这里是配置改动进入线上的唯一闸门。一条提交的走向是：
            待审批 → 通过后立刻生成一个不可变的版本快照（版本号自增，可在 Agent 详情页回滚），
            或被驳回后退回给提交人重新修改。审批前请先展开「查看变更」逐分区核对 diff：
            确认改动范围与变更说明一致、没有夹带无关分区的改动，再决定通过或驳回。
            审批动作会连同审批人一起写入审计日志。
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <InlineField label="状态" hint="按审批流转阶段筛选">
          {({ id }) => (
            <Select
              id={id}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-52"
            >
              {STATUS_OPTS.map((s) => (
                <option key={s} value={s}>
                  {s === "ALL" ? "全部状态" : `${metaOf(RELEASE_STATUS, s).label}（${s}）`}
                </option>
              ))}
            </Select>
          )}
        </InlineField>
      </div>

      {error && (
        <Alert
          tone="danger"
          title="发布审批列表加载失败"
          className="mt-4"
          onRetry={fetchList}
          retryHint="点这里会重新请求一次 /api/releases，不用刷新整个页面。"
        >
          {error}
          <span className="mt-1 block text-xs">
            列表数据来自 /api/releases。请确认服务已启动、底层数据文件存在且格式合法，然后重试。
          </span>
        </Alert>
      )}

      {reviewError && (
        <Alert tone="danger" title="审批动作未生效" className="mt-4">
          {reviewError}
          <span className="mt-1 block text-xs">
            这条提交仍保持「待审批」，没有生成版本，也没有退回提交人。可以刷新页面确认当前状态后再试一次。
          </span>
        </Alert>
      )}

      {loading ? (
        <div className="mt-8 space-y-3" role="status" aria-live="polite">
          <span className="sr-only">正在加载发布审批列表</span>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        <EmptyState
          className="mt-8"
          title="暂无发布审批记录"
          description={
            filtered
              ? "当前筛选条件下没有匹配的提交。可以把状态改回「全部状态」再看一次。"
              : "还没有任何配置变更提交上来。审批单不在本页创建：先到 Agent 详情页修改某个分区的配置并保存，改动才会作为一条待审批提交出现在这里。"
          }
          action={
            <Link
              href="/agents/"
              className="inline-flex h-9 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--foreground)] transition-colors duration-150 hover:border-[var(--muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            >
              去 Agent 列表改配置
            </Link>
          }
          hint="提交人写的「变更说明」会原样显示在审批单上，因此改配置时把动机写清楚，能显著降低审批来回沟通的成本。"
        />
      ) : (
        <>
          <CountLine
            className="mt-6"
            error={!!error}
            unknown="提交条数与待审批数量这次没能取到 —— 上面是加载失败，不代表没有待你审批的提交。"
          >
            共 {items.length} 条提交{filtered ? "（已按当前筛选条件过滤）" : ""}
            {pendingCount > 0 ? `，其中 ${pendingCount} 条待你审批` : "，当前没有待审批项"}。
            只有状态为「待审批」的提交才会显示「通过 / 拒绝」按钮；已审批的提交保留在列表里作为归档记录，
            其 diff 仍可随时展开复查。悬停任一状态徽章可以看到该状态的含义。
          </CountLine>
          <ul className="mt-2 space-y-3">
            {items.map((rel) => {
              const busy = processing === rel.id;
              const expanded = expandedId === rel.id;
              return (
                <li key={rel.id}>
                  <Card pad="md">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {rel.agent ? (
                            <Link
                              href={`/agents/${rel.agentId}/`}
                              className="rounded font-semibold text-[var(--foreground)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                              title="打开这个 Agent 的详情页，查看当前生效配置与版本历史"
                            >
                              {rel.agent.name}
                            </Link>
                          ) : (
                            <span
                              className="font-semibold text-[var(--muted)]"
                              title="这条提交关联的 Agent 已不存在，可能已被删除；提交记录仍保留以便追溯，但不建议再审批"
                            >
                              已删除的 Agent
                            </span>
                          )}
                          <StatusBadge dict={RELEASE_STATUS} code={rel.status} />
                          {rel.version && (
                            <Badge
                              tone="success"
                              title="审批通过后生成的版本号。该版本是不可变快照，可在 Agent 详情页回滚到它"
                              className="tabular-nums"
                            >
                              v{rel.version.version}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
                          <span className="sr-only">变更说明：</span>
                          {rel.changeNote}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--subtle)]">
                          <span title="发起这次配置变更的人">提交: {rel.submittedBy}</span>
                          <span className="tabular-nums" title="提交时间（本地时区）">
                            {new Date(rel.submittedAt).toLocaleString("zh-CN")}
                          </span>
                          {rel.changedPartitions.length > 0 && (
                            <span
                              className="cursor-help"
                              title={rel.changedPartitions.map(partitionTitle).join("；")}
                            >
                              变更: {rel.changedPartitions.map((p) => PARTITION_LABELS[p] || p).join("、")}
                            </span>
                          )}
                          {rel.approvedBy && (
                            <span title="执行审批动作的人，与审计日志一致">
                              审批: {rel.approvedBy}
                            </span>
                          )}
                          {rel.approvedAt && (
                            <span className="tabular-nums" title="审批动作发生的时间（本地时区）">
                              {new Date(rel.approvedAt).toLocaleString("zh-CN")}
                            </span>
                          )}
                        </div>
                        {rel.reviewComment && (
                          <p className="mt-2 text-sm italic leading-relaxed text-[var(--muted)]">
                            审批意见: {rel.reviewComment}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-row-reverse items-center justify-end gap-2 sm:flex-col sm:items-end">
                        {rel.status === "PENDING" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => setPendingReview({ release: rel, action: "APPROVED" })}
                              disabled={busy}
                              title="通过这次变更，并立即生成一个新的不可变版本"
                            >
                              通过
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => setPendingReview({ release: rel, action: "REJECTED" })}
                              disabled={busy}
                              title="驳回这次变更，配置不会上线，提交人可修改后重新提交"
                            >
                              拒绝
                            </Button>
                          </div>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setExpandedId(expanded ? null : rel.id)}
                          aria-expanded={expanded}
                          aria-controls={`diff-${rel.id}`}
                          title={expanded ? "收起本次变更的逐分区 diff" : "展开本次变更的逐分区 diff，逐项核对改了什么"}
                        >
                          {expanded ? "收起变更" : "查看变更"}
                        </Button>
                      </div>
                    </div>
                    {expanded && (
                      <DiffViewer
                        id={`diff-${rel.id}`}
                        releaseId={rel.id}
                        changedPartitions={rel.changedPartitions}
                      />
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={pendingReview?.action === "APPROVED"}
        onCancel={() => setPendingReview(null)}
        onConfirm={() => pendingReview && handleReview(pendingReview.release.id, "APPROVED")}
        title="确认通过这次配置变更？"
        tone="primary"
        confirmLabel="通过并发布"
        loading={processing !== null}
        loadingLabel="发布中…"
        description={
          <>
            将通过「{pendingReview?.release.agent?.name ?? "已删除的 Agent"}」的配置变更
            {pendingReview && pendingReview.release.changedPartitions.length > 0
              ? `（涉及 ${pendingReview.release.changedPartitions
                  .map((p) => PARTITION_LABELS[p] || p)
                  .join("、")} 分区）`
              : ""}
            。
            <span className="mt-1 block">
              变更说明：{pendingReview?.release.changeNote}
            </span>
          </>
        }
        warning={
          <>
            通过后会立即生成一个新版本(版本号自增)并成为当前生效配置,面向真实用户。
            版本快照不可修改;如需撤回,只能到 Agent 详情页回滚到上一个版本。
            审批动作会连同你的身份写入审计日志。
          </>
        }
      />

      <ConfirmDialog
        open={pendingReview?.action === "REJECTED"}
        onCancel={() => setPendingReview(null)}
        onConfirm={() => pendingReview && handleReview(pendingReview.release.id, "REJECTED")}
        title="确认驳回这次配置变更？"
        tone="danger"
        confirmLabel="驳回"
        loading={processing !== null}
        loadingLabel="提交中…"
        description={
          <>
            将驳回「{pendingReview?.release.agent?.name ?? "已删除的 Agent"}」的配置变更，这些改动不会上线。
            <span className="mt-1 block">
              变更说明：{pendingReview?.release.changeNote}
            </span>
          </>
        }
        warning={
          <>
            驳回后当前生效配置保持不变,不会生成新版本。提交人可以修改后重新提交,
            因此建议在驳回前先与提交人沟通具体原因。此动作同样会写入审计日志。
          </>
        }
      />
    </div>
  );
}

/** 变更详情 diff 查看器：展开后拉取 release 的 configSnapshot + baseline，按分区渲染 diff */
function DiffViewer({
  id,
  releaseId,
  changedPartitions,
}: {
  id: string;
  releaseId: string;
  changedPartitions: string[];
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // AI 变更摘要（真实调用 MiMo）
  const [summary, setSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [sumErr, setSumErr] = useState("");

  const handleSummary = async () => {
    setSummarizing(true);
    setSumErr("");
    try {
      const res = await fetch(`/api/releases/${releaseId}/summary`, { method: "POST" });
      const json = await res.json();
      if (json.success) setSummary(json.data.summary);
      else setSumErr(json.error || "摘要生成失败");
    } catch {
      setSumErr("网络错误");
    } finally {
      setSummarizing(false);
    }
  };

  // 用 attempt 计数触发重新加载：让下面这个带 cancelled 守卫的 effect 整体重跑，
  // 从而保留「组件卸载后不再 setState」与「旧请求不覆盖新结果」两条既有保证。
  const [attempt, setAttempt] = useState(0);

  // 重试时同步重置 loading/error 是有意的；setState 均在发起请求前完成，无级联风险
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    fetch(`/api/releases/${releaseId}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) setData(json.data);
        else setErr(json.error || "加载失败");
      })
      .catch(() => { if (!cancelled) setErr("网络错误"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [releaseId, attempt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) {
    return (
      <div id={id} className="mt-4" role="status" aria-live="polite">
        <span className="sr-only">正在加载变更详情</span>
        <Skeleton className="h-32 rounded-md" />
      </div>
    );
  }
  if (err) {
    return (
      <div id={id}>
        <Alert
          tone="danger"
          title="变更详情加载失败"
          className="mt-4"
          onRetry={() => setAttempt((n) => n + 1)}
          retryHint="点这里会重新取一次配置快照，不必收起再展开。"
        >
          {err}
          <span className="mt-1 block text-xs">
            未能取到这次提交的配置快照，因此无法比对 diff。建议先收起再重新展开；若仍失败，请勿在看不到 diff 的情况下直接审批。
          </span>
        </Alert>
      </div>
    );
  }
  if (!data) return null;

  const snapshot = (data.configSnapshot ?? {}) as Record<string, unknown>;
  const baseline = (data.baseline ?? {}) as Record<string, unknown>;
  const baseLabel = String(baseline.version || "初始");

  const partitions = (changedPartitions.length > 0
    ? changedPartitions
    : ["PROMPT", "KNOWLEDGE", "TOOLS", "ROUTING"]
  ).map((p) => p.toLowerCase());

  return (
    <div id={id} className="mt-4 border-t border-[var(--border)] pt-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            变更详情（对比 Version {baseLabel} → 本次）
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--subtle)]">
            左侧基线是审批通过前仍在线上生效的 Version {baseLabel} 配置，右侧是这次提交的内容。
            <span className="font-medium text-[var(--success)]">+</span> 表示新增字段、
            <span className="font-medium text-[var(--danger)]">-</span> 表示被删除的字段、
            <span className="font-medium text-[var(--warn)]">~</span> 表示值被改写。
            比对只到字段的第一层，嵌套对象的内部改动会整体算作一次「改写」，需要点「原始 JSON」逐行核对。
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleSummary}
          loading={summarizing}
          loadingText="生成中…"
          title="调用模型把这些 diff 翻译成一段自然语言摘要，帮助快速判断改动意图"
        >
          AI 变更摘要
        </Button>
      </div>
      {!summary && !sumErr && (
        <Hint className="mb-3">
          「AI 变更摘要」会真实调用模型，把下方 diff 概括成一段人话（通常几秒内返回）。它只是辅助阅读，不替代逐分区核对。
        </Hint>
      )}
      {summary && (
        <div
          className="mb-3 whitespace-pre-wrap rounded-md bg-[var(--surface-elevated)] p-3 text-[13px] leading-relaxed text-[var(--foreground)] ring-1 ring-[var(--success-border)]"
          role="status"
          aria-live="polite"
        >
          <Badge tone="success" className="mr-2" title="由模型生成的摘要，不是人工撰写的变更说明">
            AI 摘要
          </Badge>
          {summary}
          <span className="mt-2 block text-xs text-[var(--subtle)]">
            以上摘要由模型根据 diff 推断生成，可能遗漏细节或语气过于乐观；审批结论请以下方逐分区 diff 为准。
          </span>
        </div>
      )}
      {sumErr && (
        <Alert tone="warn" title="AI 摘要生成失败" className="mb-3">
          {sumErr}
          <span className="mt-1 block text-xs">
            摘要失败不影响审批，下方 diff 仍然完整可读。若持续失败，通常是未配置模型凭据，可到 MaaS 页做一次连通性测试。
          </span>
        </Alert>
      )}
      <div className="space-y-3">
        {partitions.map((p) => {
          const before = baseline[p] as Record<string, unknown> | null;
          const after = snapshot[p] as Record<string, unknown> | null;
          const diff = computeDiff(before, after);
          return (
            <PartitionDiff
              key={p}
              partition={p}
              baseLabel={baseLabel}
              before={before}
              after={after}
              diff={diff}
            />
          );
        })}
      </div>
      {changedPartitions.length === 0 && (
        <Hint className="mt-3">
          这次提交没有记录具体的改动分区，因此上方按 Prompt / 知识 / 工具 / 路由 四个分区全量比对，显示「无变更」的分区即与基线一致。
        </Hint>
      )}
    </div>
  );
}

/** 单分区的 diff 展示 */
function PartitionDiff({
  partition,
  baseLabel,
  before,
  after,
  diff,
}: {
  partition: string;
  baseLabel: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  diff: { added: string[]; removed: string[]; changed: string[] };
}) {
  const [showRaw, setShowRaw] = useState(false);
  const code = partition.toUpperCase();
  const label = PARTITION_LABELS[code] || partition;
  const hasChange = diff.added.length + diff.removed.length + diff.changed.length > 0;

  return (
    <div className="rounded-md bg-[var(--background)] ring-1 ring-[var(--border)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <span
          className="cursor-help text-[12px] font-semibold text-[var(--foreground)]"
          title={partitionTitle(code)}
        >
          {label}
        </span>
        <div className="flex items-center gap-2">
          {hasChange ? (
            <span className="text-[10px] text-[var(--subtle)]">
              <span className="sr-only">
                本分区新增 {diff.added.length} 个字段，删除 {diff.removed.length} 个字段，改写{" "}
                {diff.changed.length} 个字段。
              </span>
              <span className="font-medium text-[var(--success)]" title={`新增 ${diff.added.length} 个字段`} aria-hidden="true">
                +{diff.added.length}
              </span>{" "}
              <span className="font-medium text-[var(--danger)]" title={`删除 ${diff.removed.length} 个字段`} aria-hidden="true">
                -{diff.removed.length}
              </span>{" "}
              <span className="font-medium text-[var(--warn)]" title={`改写 ${diff.changed.length} 个字段`} aria-hidden="true">
                ~{diff.changed.length}
              </span>
            </span>
          ) : (
            <span className="text-[10px] text-[var(--subtle)]">无变更</span>
          )}
          <button
            onClick={() => setShowRaw(!showRaw)}
            aria-expanded={showRaw}
            title={
              showRaw
                ? "回到按字段归纳的摘要视图"
                : "并排显示基线与本次提交的完整 JSON，用于核对嵌套结构内部的改动"
            }
            className="rounded text-[10px] text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            {showRaw ? "摘要" : "原始 JSON"}
          </button>
        </div>
      </div>
      {showRaw ? (
        <div className="grid grid-cols-1 gap-px bg-[var(--border)] sm:grid-cols-2">
          <div className="bg-[var(--background)] p-3">
            <p className="mb-1 text-[10px] font-medium uppercase text-[var(--subtle)]">
              回滚前
              <span className="ml-1 normal-case" title={`审批通过前线上仍在生效的 Version ${baseLabel} 配置`}>
                （基线 Version {baseLabel}）
              </span>
            </p>
            <pre className="max-h-48 overflow-auto text-[10px] leading-relaxed text-[var(--muted)]">
              {before ? JSON.stringify(before, null, 2) : "（空）"}
            </pre>
          </div>
          <div className="bg-[var(--background)] p-3">
            <p className="mb-1 text-[10px] font-medium uppercase text-[var(--subtle)]">
              本次提交
              <span className="ml-1 normal-case" title="审批通过后将成为新版本的内容">
                （通过后生效）
              </span>
            </p>
            <pre className="max-h-48 overflow-auto text-[10px] leading-relaxed text-[var(--muted)]">
              {after ? JSON.stringify(after, null, 2) : "（空）"}
            </pre>
          </div>
        </div>
      ) : hasChange ? (
        <div className="space-y-1 p-3">
          {diff.added.map((k) => (
            <DiffLine key={`a-${k}`} type="add" field={k} value={formatVal(after?.[k])} />
          ))}
          {diff.removed.map((k) => (
            <DiffLine key={`r-${k}`} type="remove" field={k} value={formatVal(before?.[k])} />
          ))}
          {diff.changed.map((k) => (
            <div key={`c-${k}`} className="text-[11px] leading-relaxed">
              <span className="sr-only">改写字段 </span>
              <span className="font-medium text-[var(--warn)]">~ {k}:</span>
              <span className="ml-2 text-[var(--danger)] line-through" title="基线中的旧值">
                {formatVal(before?.[k])}
              </span>
              <span className="mx-1 text-[var(--subtle)]" aria-hidden="true">→</span>
              <span className="text-[var(--success)]" title="本次提交的新值">
                {formatVal(after?.[k])}
              </span>
            </div>
          ))}
          <p className="pt-1 text-[10px] leading-relaxed text-[var(--subtle)]">
            过长的值已截断显示，需要看全文请切换到「原始 JSON」。
          </p>
        </div>
      ) : (
        <div className="p-3 text-[11px] leading-relaxed text-[var(--subtle)]">
          该分区与上一版本一致
          <span className="ml-1">
            —— 本次提交没有改动它，通过后这一分区的行为保持不变。
          </span>
        </div>
      )}
    </div>
  );
}

function DiffLine({ type, field, value }: { type: "add" | "remove"; field: string; value: string }) {
  const color = type === "add" ? "text-[var(--success)]" : "text-[var(--danger)]";
  const symbol = type === "add" ? "+" : "-";
  return (
    <div className={`text-[11px] leading-relaxed ${color}`}>
      <span className="sr-only">{type === "add" ? "新增字段 " : "删除字段 "}</span>
      <span className="font-medium">{symbol} {field}:</span>{" "}
      <span className="opacity-90">{value}</span>
    </div>
  );
}

/** 浅层 diff（与后端 computeJsonDiff 逻辑一致） */
function computeDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): { added: string[]; removed: string[]; changed: string[] } {
  const a = before ?? {};
  const b = after ?? {};
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const k of Object.keys(a)) {
    if (!(k in b)) removed.push(k);
    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changed.push(k);
  }
  for (const k of Object.keys(b)) {
    if (!(k in a)) added.push(k);
  }
  return { added, removed, changed };
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return v.length > 80 ? v.slice(0, 80) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = JSON.stringify(v);
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}
