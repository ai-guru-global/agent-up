"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AGENT_STATUS,
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Hint,
  Input,
  PARTITION,
  Select,
  Skeleton,
  StatusBadge,
  Textarea,
  metaOf,
} from "@/components/ui";
import { EvalCasePanel } from "./eval-case-panel";
import { EvidenceChainPanel } from "./evidence-chain-panel";

interface AgentDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  productGroup: { id: string; name: string; displayName: string };
  _count: { feedbacks: number; releases: number; versions: number; skillBindings: number };
  releases: Array<{ id: string }>;
}

interface PromptConfig {
  systemPrompt: string;
  roleDefinition: string | null;
  constraints: string[];
  outputFormat: string | null;
}

interface KnowledgeConfig {
  searchStrategy: string;
  fallbackToMcp: boolean;
  maxWikiResults: number;
  confidenceThreshold: number;
}

/** partition 键与 status.ts 的 PARTITION 字典对齐，用于取「隐喻 + 职责说明」 */
const TABS = [
  { key: "prompt", label: "Prompt 配置", partition: "PROMPT" },
  { key: "knowledge", label: "Knowledge 配置", partition: "KNOWLEDGE" },
  { key: "tools", label: "Tools 配置", partition: "TOOLS" },
  { key: "routing", label: "Routing 配置", partition: "ROUTING" },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function AgentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  // 主数据这次「没取到」的原因，与下方版本历史的 loadError 各管各的数据。
  // 只有接口明确答复 404 才能说「不存在」；服务器或网络故障必须按「没取到」呈现，
  // 否则一次临时的查询失败就会被用户当成「这个 Agent 已经没了」
  const [agentError, setAgentError] = useState("");
  // 递增以触发请求整体重跑（与 Release 详情的做法一致），配合 cancelled 守卫防止旧响应覆盖新状态
  const [attempt, setAttempt] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>("prompt");
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [editedConfig, setEditedConfig] = useState<Record<string, unknown>>({});
  const [configLoading, setConfigLoading] = useState(true);
  /** JSON 编辑器的解析错误。非空时禁用保存，避免把上一次的旧内容误当成本次改动提交 */
  const [configError, setConfigError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; text: string } | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAgentError("");
    fetch(`/api/agents/${id}/`)
      .then((r) => r.json().then((json) => ({ status: r.status, json })))
      .then(({ status, json }) => {
        if (cancelled) return;
        if (json.success) { setAgent(json.data); return; }
        setAgent(null);
        // 404 是接口对「这条记录确实没有」的明确答复，保持 agentError 为空，
        // 让渲染端落进「Agent 不存在」的空态；其余一律归入「没取到」
        if (status !== 404) setAgentError(json.error || "没能取得这个 Agent 的数据");
      })
      .catch(() => {
        if (cancelled) return;
        setAgent(null);
        setAgentError("网络错误，没能完成查询");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, attempt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const fetchConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError("");
    setSaveResult(null);
    const res = await fetch(`/api/agents/${id}//config/${activeTab}`);
    const json = await res.json();
    const cfg = json.success && json.data ? json.data : {};
    setConfig(cfg);
    setEditedConfig(cfg);
    setConfigLoading(false);
  }, [id, activeTab]);

  // 拉取前同步重置 loading/error 是有意的；setState 均在 await 前完成，无级联风险
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch(`/api/agents/${id}//config/${activeTab}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editedConfig),
      });
      const json = await res.json();
      if (json.success) {
        setConfig(json.data);
        setSaveResult({ ok: true, text: "保存成功" });
      } else {
        setSaveResult({ ok: false, text: json.error });
      }
    } catch {
      setSaveResult({ ok: false, text: "网络错误" });
    } finally {
      setSaving(false);
    }
  };

  /** ← → 在标签间移动焦点，Home / End 跳到首尾，符合 WAI-ARIA tabs 模式 */
  const handleTabKeyDown = (e: ReactKeyboardEvent, index: number) => {
    const last = TABS.length - 1;
    let next = -1;
    if (e.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next < 0) return;
    e.preventDefault();
    setActiveTab(TABS[next].key);
    tabRefs.current[next]?.focus();
  };

  if (loading) {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">正在加载 Agent 详情</span>
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 h-4 w-80" />
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[92px] rounded-lg" />
          ))}
        </div>
        <Skeleton className="mt-8 h-64 rounded-lg" />
      </div>
    );
  }

  // 查询本身失败（非 404）：不能渲染下面的空态 —— 那会把「这次没查到」说成「不存在」，
  // 用户可能因此认定记录已被删除而不再理会一条其实完好的数据
  if (!agent && agentError) {
    return (
      <div className="mt-8">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
          这个 Agent 的数据没能加载出来
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
          这不是「Agent 不存在」，而是这一次查询没有完成；ID 为{" "}
          <code className="font-mono text-xs">{id}</code> 的记录是否存在，此刻无法下结论。
        </p>
        <Alert
          tone="danger"
          title="查询未成功"
          className="mt-4"
          onRetry={() => setAttempt((n) => n + 1)}
          retryHint="点这里会用同一个 ID 再查一次，只是读取，不会提交任何修改。"
        >
          {agentError}
          <span className="mt-1 block text-xs">
            若反复失败，可回到列表页确认这条记录是否仍在，再检查 apps/web/data/agents/ 下对应 JSON 是否为合法格式。
          </span>
        </Alert>
      </div>
    );
  }

  if (!agent) {
    return (
      <EmptyState
        className="mt-8"
        titleAs="h1"
        title="Agent 不存在"
        description={
          <>
            没有找到 ID 为 <code className="font-mono text-xs">{id}</code> 的 Agent。
            它可能已被删除，或者链接里的 ID 有误。
          </>
        }
        action={
          <Link
            href="/agents/"
            className="inline-flex h-9 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            返回 Agent 列表
          </Link>
        }
        hint="Agent 数据存放在 apps/web/data/agents/ 目录下，每个 Agent 一个 JSON 文件。"
      />
    );
  }

  const activeMeta = PARTITION[TABS.find((t) => t.key === activeTab)!.partition];

  return (
    <div>
      <header className="mb-6">
        <nav aria-label="面包屑" className="mb-2 flex items-center gap-1.5 text-xs text-[var(--subtle)]">
          <Link
            href="/agents/"
            className="rounded hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            Agent 管理
          </Link>
          <span aria-hidden="true">/</span>
          <span className="truncate text-[var(--muted)]">{agent.name}</span>
        </nav>

        <div className="flex items-start gap-3">
          <Link
            href="/agents/"
            aria-label="返回 Agent 列表"
            title="返回 Agent 列表"
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            <span aria-hidden="true">&larr;</span>
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">{agent.name}</h1>
              <StatusBadge dict={AGENT_STATUS} code={agent.status} />
            </div>
            {agent.description && (
              <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{agent.description}</p>
            )}
            <p className="mt-1 text-xs text-[var(--subtle)]">
              所属产品组：{agent.productGroup?.displayName || "未指定"}
              <span className="mx-1.5" aria-hidden="true">·</span>
              当前状态：{metaOf(AGENT_STATUS, agent.status).desc}
            </p>
          </div>
        </div>

        <Hint className="mt-3 max-w-3xl">
          这一页是单个 Agent 的全部可调项。下方按四分区拆分：Prompt（性格与纪律）、知识（长期记忆）、
          工具（手）、路由（分诊台）。改完任一分区先「保存配置」写入草稿，再到发布页提交审批；
          审批通过后才会生成版本快照并对外生效。保存本身不会影响正在服务的线上配置。
        </Hint>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MiniStat
          label="反馈"
          value={agent._count.feedbacks}
          explain="累计收到的反馈条数，是判断这个 Agent 该不该改的主要依据"
        />
        <MiniStat
          label="版本"
          value={agent._count.versions}
          explain="审批通过后生成的不可变快照数量，可用于回滚"
        />
        <MiniStat
          label="Skills"
          value={agent._count.skillBindings}
          explain="已绑定的可复用技能组件数量，属于工具分区"
        />
        <MiniStat
          label="待审批"
          value={agent.releases?.length ?? 0}
          explain="已提交但还没裁决的配置变更，卡在这里的改动尚未生效"
        />
      </div>

      <div className="mt-8 border-b border-[var(--border)]">
        <nav
          role="tablist"
          aria-label="四分区配置"
          className="-mx-4 flex gap-6 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        >
          {TABS.map((tab, i) => {
            const active = activeTab === tab.key;
            const meta = PARTITION[tab.partition];
            return (
              <button
                key={tab.key}
                ref={(el) => { tabRefs.current[i] = el; }}
                role="tab"
                id={`tab-${tab.key}`}
                aria-selected={active}
                aria-controls={`panel-${tab.key}`}
                tabIndex={active ? 0 : -1}
                title={`${meta.label}（${meta.role}）：${meta.desc}`}
                onClick={() => setActiveTab(tab.key)}
                onKeyDown={(e) => handleTabKeyDown(e, i)}
                className={`shrink-0 whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)] ${
                  active
                    ? "border-[var(--accent)] text-[var(--foreground)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-6">
        <div
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          <div className="mb-5 border-b border-[var(--border)] pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--foreground)]">
                {activeMeta.label} 分区
              </h2>
              <Badge tone={activeMeta.tone} title={activeMeta.desc}>
                {activeMeta.role}
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--subtle)]">{activeMeta.desc}</p>
          </div>

          {configLoading ? (
            <div role="status" aria-live="polite" className="space-y-3">
              <span className="sr-only">正在加载 {activeMeta.label} 分区配置</span>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-32 rounded-md" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-16 rounded-md" />
            </div>
          ) : (
            <>
              {activeTab === "prompt" && (
                <PromptEditor
                  config={editedConfig as unknown as PromptConfig}
                  onChange={(c) => setEditedConfig(c as unknown as Record<string, unknown>)}
                />
              )}
              {activeTab === "knowledge" && (
                <KnowledgeEditor
                  config={editedConfig as unknown as KnowledgeConfig}
                  onChange={(c) => setEditedConfig(c as unknown as Record<string, unknown>)}
                />
              )}
              {activeTab === "tools" && (
                <JsonEditor
                  key={`tools-${config ? "ready" : "empty"}`}
                  config={editedConfig}
                  onChange={setEditedConfig}
                  onErrorChange={setConfigError}
                  label="Tools 配置 (JSON)"
                  hint="这里登记 Agent 可以调用的 MCP 工具与已绑定的 Skill。工具决定它「能做什么动作」，例如查实例状态、开工单、发通知。"
                  example={'{\n  "enabledTools": ["ecs.describeInstances"],\n  "mcpServers": [\n    { "name": "aliyun-ecs", "timeoutMs": 8000 }\n  ]\n}'}
                />
              )}
              {activeTab === "routing" && (
                <JsonEditor
                  key={`routing-${config ? "ready" : "empty"}`}
                  config={editedConfig}
                  onChange={setEditedConfig}
                  onErrorChange={setConfigError}
                  label="Routing 配置 (JSON)"
                  hint="这里定义工单该由谁接手：命中哪些规则时自己回答、命中哪些时直接转人工，以及置信度低到多少就放弃自动回复。"
                  example={'{\n  "rules": [\n    { "match": "退款|发票", "action": "TRANSFER_HUMAN" }\n  ],\n  "handoffThreshold": 0.5\n}'}
                />
              )}
            </>
          )}
        </div>

        {saveResult && (
          <Alert
            tone={saveResult.ok ? "success" : "danger"}
            title={saveResult.ok ? "已保存到草稿" : "保存未成功"}
            className="mt-3"
          >
            {saveResult.text}
            <span className="mt-1 block text-xs">
              {saveResult.ok
                ? "改动已写入当前草稿配置，但还没有对外生效。到发布页提交审批，通过后才会生成版本快照。下方的试聊 Playground 已经会用这份新配置，可以先自己验一遍。"
                : "配置没有被写入，页面上的内容仍是你刚才编辑的版本。可以修正后重试，或刷新页面放弃这次改动。"}
            </span>
          </Alert>
        )}

        <div className="mt-4 flex flex-col items-end gap-2">
          {configError && (
            <p className="text-[11px] text-[var(--danger)]">
              当前 JSON 存在格式错误，已暂时禁用保存，修正后即可提交。
            </p>
          )}
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!!configError}
            loading={saving}
            loadingText="保存中..."
            title={
              configError
                ? "JSON 格式错误，无法保存"
                : `把当前「${activeMeta.label}」分区的改动写入草稿配置`
            }
          >
            保存配置
          </Button>
          <Hint>
            只保存当前这一个分区；切换标签不会丢失已保存的内容，但未保存的改动会被重新拉取的配置覆盖。
          </Hint>
        </div>
      </div>

      <ChatPlayground agentId={id} />

      <EvalCasePanel agentId={id} />

      <EvidenceChainPanel agentId={id} />

      <VersionHistory agentId={id} activePartition={activeTab} onRollbackDone={fetchConfig} />
    </div>
  );
}

const PARTITION_LABELS: Record<string, string> = {
  prompt: "Prompt",
  knowledge: "知识",
  tools: "工具",
  routing: "路由",
};

/** 资产演进线单条目（R5a）：与 version-lineage-service 响应形状对应 */
interface LineageEntry {
  changedPartitions: string[] | null;
  diffSummary: Record<string, { added: number; removed: number; changed: number }> | null;
}

/** 「较上一版本」摘要：基线 / 完全一致 / 分区级键计数三种形态 */
function lineageSummary(entry: LineageEntry): string | null {
  if (entry.changedPartitions === null) return "资产基线（首个版本）";
  if (entry.changedPartitions.length === 0) return "与上一版本配置一致";
  const parts = entry.changedPartitions.map((p) => {
    const label = PARTITION_LABELS[p.toLowerCase()] ?? p;
    const c = entry.diffSummary?.[p];
    if (!c) return label;
    const bits = [
      c.added > 0 ? `新增 ${c.added}` : "",
      c.removed > 0 ? `删除 ${c.removed}` : "",
      c.changed > 0 ? `修改 ${c.changed}` : "",
    ].filter(Boolean);
    return `${label}（${bits.join(" · ")}）`;
  });
  return `较上一版本：${parts.join("、")}`;
}

interface EffectivenessReport {
  totalFeedbacks: number;
  byRating: { POSITIVE: number; NEGATIVE: number; NEUTRAL: number };
  bySeverity: { CRITICAL: number; MAJOR: number; MINOR: number; SUGGESTION: number };
}

/** 版本效果标签：只在 version.publishedAt 距今 ≥ 7 天后由 API 端 lazy fill。 */
function EffectivenessChip({ report }: { report: EffectivenessReport }) {
  const neg = report.byRating.NEGATIVE;
  const critical = report.bySeverity.CRITICAL;
  // 颜色按「问题密度」:critical > 0 → 红色,negative > positive → 琥珀,正常 → 灰色
  const tone =
    critical > 0
      ? "bg-[var(--danger-bg)] text-[var(--danger)]"
      : neg > report.byRating.POSITIVE
        ? "bg-[var(--warn-bg)] text-[var(--warn)]"
        : "bg-[var(--surface-elevated)] text-[var(--muted)]";
  return (
    <span
      className={`inline-flex cursor-help items-center gap-1 rounded px-1.5 py-0.5 text-[11px] tabular-nums ${tone}`}
      title={`上线 7 天窗口内的反馈汇总:总 ${report.totalFeedbacks} 条,负向 ${neg} 条,严重 ${critical} 条`}
    >
      <span aria-hidden="true">📊</span>
      {report.totalFeedbacks} 反馈 · 负 {neg}
      {critical > 0 && ` · ⚠${critical}`}
    </span>
  );
}

/** 版本历史 + 分区级一键回滚 */
function VersionHistory({
  agentId,
  activePartition,
  onRollbackDone,
}: {
  agentId: string;
  activePartition: string;
  onRollbackDone: () => void;
}) {
  const [versions, setVersions] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  /** 版本列表拉取失败的原因。原实现无 catch，网络异常时 loading 永远不会结束 */
  const [loadError, setLoadError] = useState("");
  /** 资产演进线（R5a）：versionId → 较上一版本的分区级变更摘要；拉取失败时静默降级为不显示 */
  const [lineage, setLineage] = useState<Map<string, LineageEntry> | null>(null);
  const [rolling, setRolling] = useState<string | null>(null);
  const [rollingAll, setRollingAll] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  /** 待确认的回滚意图。替代原生 confirm()，让影响范围可以完整解释清楚 */
  const [pendingPartition, setPendingPartition] = useState<{ id: string; label: string } | null>(null);
  const [pendingAll, setPendingAll] = useState<{ id: string; label: string } | null>(null);

  const partitionLabel = PARTITION_LABELS[activePartition] || activePartition;

  const fetchVersions = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch(`/api/agents/${agentId}//versions`);
      const json = await res.json();
      // 失败时清空（与 wiki 的 fetchPages 一致）：回滚后重拉如果失败，
      // 留着旧列表会让人以为新快照没生成
      if (json.success) setVersions(json.data.items);
      else {
        setVersions([]);
        setLoadError(json.error || "版本历史加载失败");
      }
    } catch {
      setVersions([]);
      setLoadError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  // 演进线是辅助信息：失败不重试不报错，只是每行少一句「较上一版本」摘要
  const fetchLineage = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/version-lineage`);
      const json = await res.json();
      if (json.success) {
        setLineage(
          new Map(
            (json.data.lineage as Array<LineageEntry & { versionId: string }>).map((e) => [
              e.versionId,
              e,
            ]),
          ),
        );
      }
    } catch {
      /* 辅助信息降级 */
    }
  }, [agentId]);

  useEffect(() => { fetchVersions(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [fetchVersions]);
  useEffect(() => { fetchLineage(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [fetchLineage]);

  const handleRollback = async (versionId: string, versionLabel: string) => {
    setPendingPartition(null);
    setRolling(versionId);
    setResult(null);
    try {
      const res = await fetch(`/api/agents/${agentId}//config/${activePartition}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      const json = await res.json();
      if (json.success) {
        setResult({ ok: true, text: `已回滚 ${PARTITION_LABELS[activePartition]} 到 v${versionLabel}` });
        onRollbackDone();
      } else {
        setResult({ ok: false, text: json.error || "回滚失败" });
      }
    } catch {
      setResult({ ok: false, text: "网络错误" });
    } finally {
      setRolling(null);
    }
  };

  const handleRollbackAll = async (versionId: string, versionLabel: string) => {
    setPendingAll(null);
    setRollingAll(versionId);
    setResult(null);
    try {
      const res = await fetch(`/api/agents/${agentId}//rollback/${versionId}`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        const newVer = json.data.version.version as string;
        setResult({ ok: true, text: `已回滚整个 Agent 到 v${versionLabel},新版本 v${newVer} 已生成` });
        onRollbackDone();
        await fetchVersions();
        fetchLineage();
      } else {
        setResult({ ok: false, text: json.error || "整版本回滚失败" });
      }
    } catch {
      setResult({ ok: false, text: "网络错误" });
    } finally {
      setRollingAll(null);
    }
  };

  if (loading) {
    return (
      <div className="mt-8" role="status" aria-live="polite">
        <span className="sr-only">正在加载版本历史</span>
        <Skeleton className="h-24 rounded-lg" />
      </div>
    );
  }

  return (
    <section className="mt-8" aria-labelledby="version-history-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="version-history-heading" className="text-sm font-semibold text-[var(--foreground)]">
          版本历史{" "}
          {/* 失败时 versions 已被清空，标题不能报 (0) —— 那是「没取到」而不是「没有版本」 */}
          <span className="font-normal text-[var(--muted)]" data-numeric>
            {loadError ? "（本次未取到）" : `(${versions.length})`}
          </span>
        </h2>
        <span className="text-[11px] text-[var(--subtle)]">
          回滚作用于当前「{partitionLabel}」分区
        </span>
      </div>

      <Hint className="mt-1 max-w-3xl">
        每次审批通过都会生成一个不可变快照，里面包含四个分区当时的完整配置。
        「回滚此分区」只覆盖你正在编辑的那一个分区，其余三个保持现状；
        「回滚整个版本」会把四个分区一起还原。两种回滚都会生成新版本，不会删除任何历史记录。
      </Hint>

      {result && (
        <Alert
          tone={result.ok ? "success" : "danger"}
          title={result.ok ? "回滚完成" : "回滚未完成"}
          className="mt-3"
        >
          {result.text}
          <span className="mt-1 block text-xs">
            {result.ok
              ? "上方编辑区已重新拉取回滚后的配置，可以直接继续编辑。这次回滚已写入审计日志，可在设置页查到操作人与时间。"
              : "配置保持回滚前的状态，没有产生任何改动。可以稍后重试，或先确认该版本是否包含此分区的快照。"}
          </span>
        </Alert>
      )}

      {loadError && (
        <Alert
          tone="danger"
          title="版本历史加载失败"
          className="mt-3"
          onRetry={fetchVersions}
          retryHint="点这里会重新拉一次版本列表，不用刷新整个页面。"
        >
          {loadError}
          <span className="mt-1 block text-xs">
            这不代表该 Agent 没有历史版本 —— 只是这次没能取到列表。刷新页面可重试；
            在看不到版本列表时请勿假设无可回滚的目标。
          </span>
        </Alert>
      )}

      {versions.length === 0 && !loadError ? (
        <EmptyState
          className="mt-3"
          title="暂无已发布版本"
          description="这个 Agent 还没有任何审批通过的版本，因此没有可回滚的目标。改完配置后到发布页提交审批，通过后就会在这里出现第一个快照。"
          hint="版本号自增且不可修改，快照内容也不会被后续改动覆盖。"
        />
      ) : (
        <ul className="mt-3 divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          {versions.map((v) => {
            const ver = v.version as string;
            const snap = v[`${activePartition}Snapshot`] as Record<string, unknown> | null;
            const eff = v.effectivenessReport as EffectivenessReport | undefined;
            const busy = rollingAll === v.id || rolling === v.id;
            const lineageEntry = lineage?.get(v.id as string);
            const lineageText = lineageEntry ? lineageSummary(lineageEntry) : null;
            return (
              <li
                key={v.id as string}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="success" title={`版本号 ${ver}，审批通过时自动生成，不可修改`}>
                      <span className="tabular-nums">v{ver}</span>
                    </Badge>
                    <span className="text-[12px] text-[var(--muted)]">
                      {v.changeNote ? String(v.changeNote) : "（无说明）"}
                    </span>
                    {eff && <EffectivenessChip report={eff} />}
                  </div>
                  <div className="mt-0.5 text-[11px] tabular-nums text-[var(--subtle)]">
                    {v.publishedAt ? (
                      <time dateTime={String(v.publishedAt)} title="该版本审批通过并生效的时间">
                        {new Date(v.publishedAt as string).toLocaleString("zh-CN")}
                      </time>
                    ) : null}
                    {" · "}
                    {v.publishedBy ? String(v.publishedBy) : ""}
                  </div>
                  {!snap && (
                    <p className="mt-1 text-[11px] text-[var(--subtle)]">
                      此版本没有保存「{partitionLabel}」分区的快照，因此只能整版本回滚。
                    </p>
                  )}
                  {lineageText && (
                    <p
                      className="mt-0.5 text-[11px] text-[var(--subtle)]"
                      title="资产演进线：与上一版本快照的结构化对比（Harness 资产版本化）"
                    >
                      {lineageText}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    onClick={() => setPendingAll({ id: v.id as string, label: ver })}
                    disabled={busy}
                    className="rounded-md px-2.5 py-1.5 text-[11px] font-medium text-[var(--warn)] ring-1 ring-[var(--warn-border)] transition-colors hover:bg-[var(--warn-bg)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-40"
                    title={`将整个 Agent 回滚到 v${ver}(覆盖 4 个分区,立即生成新版本)`}
                  >
                    {rollingAll === v.id ? "回滚中…" : "回滚整个版本"}
                  </button>
                  <button
                    onClick={() => setPendingPartition({ id: v.id as string, label: ver })}
                    disabled={busy || !snap}
                    className="rounded-md px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] ring-1 ring-[var(--accent-muted)] transition-colors hover:bg-[var(--accent-muted)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-40"
                    title={snap ? `回滚此分区的配置到 v${ver}` : "此版本无该分区快照"}
                  >
                    {rolling === v.id ? "回滚中…" : "回滚此分区"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingPartition}
        onCancel={() => setPendingPartition(null)}
        onConfirm={() => {
          if (pendingPartition) handleRollback(pendingPartition.id, pendingPartition.label);
        }}
        title={`回滚「${partitionLabel}」分区`}
        description={
          <>
            确认将「{partitionLabel}」分区回滚到 Version {pendingPartition?.label}？
            <span className="mt-2 block text-[var(--muted)]">
              只覆盖这一个分区的配置，其余三个分区（共 4 个）保持当前状态不变。
              回滚后上方编辑区会立即刷新为该版本的内容，你可以继续修改再保存。
            </span>
          </>
        }
        warning="回滚会直接覆盖当前草稿里这个分区未保存的改动，且不会自动备份。回滚本身会写入审计日志。"
        confirmLabel="确认回滚此分区"
        tone="danger"
        loading={!!rolling}
        loadingLabel="回滚中…"
      />

      <ConfirmDialog
        open={!!pendingAll}
        onCancel={() => setPendingAll(null)}
        onConfirm={() => {
          if (pendingAll) handleRollbackAll(pendingAll.id, pendingAll.label);
        }}
        title={`回滚整个 Agent 到 v${pendingAll?.label ?? ""}`}
        description={
          <>
            确认将整个 Agent 回滚到 v{pendingAll?.label}?
            <span className="mt-2 block">
              这会一次性覆盖全部 4 个分区(Prompt/知识/工具/路由),并立即生成新版本(版本号自增)。
            </span>
            <span className="mt-2 block text-[var(--muted)]">
              回滚后线上行为会立刻变回该版本的表现，不需要再走一次发布审批。
              历史版本不会被删除，如果回滚错了，可以再回滚回来。
            </span>
          </>
        }
        warning="此操作不可撤销,但回滚本身会写入审计日志。"
        confirmLabel="确认回滚整个版本"
        tone="danger"
        loading={!!rollingAll}
        loadingLabel="回滚中…"
      />
    </section>
  );
}

function MiniStat({
  label,
  value,
  explain,
}: {
  label: string;
  value: number;
  /** 这个数字怎么来的、为什么值得看 */
  explain: string;
}) {
  return (
    <Card pad="sm" className="min-w-0">
      <p className="text-2xl font-semibold tabular-nums text-[var(--foreground)]">{value}</p>
      <p className="text-xs text-[var(--muted)]" title={explain}>{label}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--subtle)]">{explain}</p>
    </Card>
  );
}

function PromptEditor({ config, onChange }: { config: PromptConfig; onChange: (c: PromptConfig) => void }) {
  return (
    <div className="space-y-5">
      <Field
        label="系统提示词"
        required
        hint="Agent 的最高指令，每一轮对话都会放在消息序列最前面。写清它是谁、用什么语气、按什么步骤处理问题、遇到冲突时优先听谁的。写得越具体，回答越稳定；这里也是绝大多数「答得不对」类反馈最终要改的地方。"
      >
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            value={config.systemPrompt || ""}
            onChange={(e) => onChange({ ...config, systemPrompt: e.target.value })}
            className="font-mono"
            rows={8}
            placeholder="你是阿里云 ECS 的技术支持工程师，负责解答实例创建、网络与运维相关的工单……"
          />
        )}
      </Field>

      <Field
        label="角色定义"
        hint="一句话概括它是谁、服务哪类用户。会拼接在系统提示词之后，帮助模型更快锁定人称与专业领域。留空则完全依赖上面的系统提示词。"
      >
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            value={config.roleDefinition || ""}
            onChange={(e) => onChange({ ...config, roleDefinition: e.target.value })}
            rows={3}
            placeholder="面向中小企业运维人员的云产品答疑助手"
          />
        )}
      </Field>

      <Field
        label="约束条件（每行一条）"
        hint="硬性禁止项，一行一条，保存时会自动忽略空行。这些条目会以清单形式注入提示词，用来兜住那些「绝对不能做」的行为，比正文里的委婉措辞更有约束力。"
      >
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            value={(config.constraints || []).join("\n")}
            onChange={(e) => onChange({ ...config, constraints: e.target.value.split("\n").filter(Boolean) })}
            rows={4}
            placeholder={"不要回答与产品无关的问题\n涉及价格时提醒用户查看官网"}
          />
        )}
      </Field>

      <Field
        label="输出格式"
        hint="期望的回答形态。留空表示不额外约束，由模型自行决定排版；填了则会作为格式要求写进提示词。前端展示 Markdown 时填 Markdown，需要程序解析时填 JSON。"
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            value={config.outputFormat || ""}
            onChange={(e) => onChange({ ...config, outputFormat: e.target.value })}
            placeholder="e.g. Markdown / JSON / 纯文本"
          />
        )}
      </Field>
    </div>
  );
}

const STRATEGY_HELP: Record<string, string> = {
  WIKI_FIRST: "先查知识库，命中不足时再补 MCP 工具结果。适合语料较全、又希望保留兜底能力的场景。",
  WIKI_ONLY: "只用知识库，绝不外呼工具。回答范围可控、可审计，但知识库没覆盖的问题只能回答不知道。",
  MCP_FIRST: "先调 MCP 工具拿实时数据，再用知识库补充解释。适合状态查询类问题，例如实例是否在运行。",
  HYBRID: "两路并行检索，取合集后重新排序。召回最高但耗时与成本也最高，适合疑难工单。",
};

function KnowledgeEditor({ config, onChange }: { config: KnowledgeConfig; onChange: (c: KnowledgeConfig) => void }) {
  const strategy = config.searchStrategy || "WIKI_FIRST";
  const wikiOnly = strategy === "WIKI_ONLY";

  return (
    <div className="space-y-5">
      <Field
        label="搜索策略"
        hint={
          <>
            决定回答之前先去哪里找料。四个选项的差别：
            <span className="mt-1 block">Wiki 优先 —— {STRATEGY_HELP.WIKI_FIRST}</span>
            <span className="block">仅 Wiki —— {STRATEGY_HELP.WIKI_ONLY}</span>
            <span className="block">MCP 优先 —— {STRATEGY_HELP.MCP_FIRST}</span>
            <span className="block">混合模式 —— {STRATEGY_HELP.HYBRID}</span>
          </>
        }
      >
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={strategy}
            onChange={(e) => onChange({ ...config, searchStrategy: e.target.value })}
          >
            <option value="WIKI_FIRST">Wiki 优先</option>
            <option value="WIKI_ONLY">仅 Wiki</option>
            <option value="MCP_FIRST">MCP 优先</option>
            <option value="HYBRID">混合模式</option>
          </Select>
        )}
      </Field>

      <div>
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="fallback"
            aria-describedby="fallback-hint"
            checked={config.fallbackToMcp !== false}
            onChange={(e) => onChange({ ...config, fallbackToMcp: e.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border border-[var(--border)] accent-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          />
          <label htmlFor="fallback" className="text-sm text-[var(--foreground)]">
            Wiki 未命中时回退到 MCP
          </label>
        </div>
        <p id="fallback-hint" className="mt-1.5 pl-6 text-[11px] leading-relaxed text-[var(--subtle)]">
          勾选后，知识库没检索到内容、或全部结果低于置信度阈值时，会自动改走 MCP 工具再试一次；
          不勾选则直接按「查不到」如实回答。开启会提高解决率，但也会增加一次外部调用的耗时。
          {wikiOnly && (
            <span className="mt-1 block text-[var(--warn)]">
              当前策略是「仅 Wiki」，该开关不会生效；如需回退能力，请把策略改为「Wiki 优先」。
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="最大 Wiki 结果数"
          hint="单次检索最多取回几条知识片段，建议 3–10。取太少容易漏掉关键信息，取太多会挤占上下文并稀释重点，反而让回答变散。"
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="number"
              min="1"
              max="50"
              step="1"
              className="tabular-nums"
              value={config.maxWikiResults || 5}
              onChange={(e) => onChange({ ...config, maxWikiResults: parseInt(e.target.value) })}
            />
          )}
        </Field>
        <Field
          label="置信度阈值"
          hint="0 到 1 之间的小数，低于该分值的检索结果不会作为答案依据。调高更保守（宁可说不知道），调低更敢答（但可能引用弱相关内容）。常用区间 0.5–0.7。"
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="number"
              step="0.1"
              min="0"
              max="1"
              className="tabular-nums"
              value={config.confidenceThreshold || 0.6}
              onChange={(e) => onChange({ ...config, confidenceThreshold: parseFloat(e.target.value) })}
            />
          )}
        </Field>
      </div>

      <Hint className="border-t border-[var(--border)] pt-4">
        这一分区只决定「怎么找料」，具体的料本身在知识库页维护。
        如果反馈显示 Agent 答得不全，先确认知识库里有没有对应内容，再回来调策略与阈值。
      </Hint>
    </div>
  );
}

function JsonEditor({ config, onChange, onErrorChange, label, hint, example }: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
  /** 把解析状态上报给页面，用于在格式错误时禁用保存 */
  onErrorChange?: (msg: string) => void;
  label: string;
  /** 这个分区管什么 */
  hint?: string;
  /** 合法结构示例，避免用户对着空对象猜字段名 */
  example?: string;
}) {
  const [jsonStr, setJsonStr] = useState(JSON.stringify(config, null, 2));
  const [parseError, setParseError] = useState("");
  const [showExample, setShowExample] = useState(false);

  const report = (msg: string) => {
    setParseError(msg);
    onErrorChange?.(msg);
  };

  const handleChange = (val: string) => {
    setJsonStr(val);
    try {
      const parsed = JSON.parse(val) as Record<string, unknown>;
      report("");
      onChange(parsed);
    } catch {
      report("JSON 格式错误");
    }
  };

  /** 一键规范缩进：只在当前内容可解析时生效 */
  const handleFormat = () => {
    try {
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      setJsonStr(JSON.stringify(parsed, null, 2));
      report("");
      onChange(parsed);
    } catch {
      report("JSON 格式错误");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label htmlFor="json-editor" className="block text-xs font-medium text-[var(--muted)]">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowExample((s) => !s)}>
            {showExample ? "隐藏示例" : "查看结构示例"}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleFormat} title="按标准缩进重新排版当前内容">
            格式化
          </Button>
        </div>
      </div>

      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--subtle)]">{hint}</p>}

      {showExample && example && (
        <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
          <p className="text-[11px] font-medium text-[var(--muted)]">合法结构示例（仅供参考，字段以后端校验为准）</p>
          <pre className="mt-1.5 overflow-x-auto font-mono text-[11px] leading-relaxed text-[var(--foreground)]">
            {example}
          </pre>
        </div>
      )}

      <Textarea
        id="json-editor"
        aria-describedby="json-editor-help"
        spellCheck={false}
        value={jsonStr}
        onChange={(e) => handleChange(e.target.value)}
        className="mt-2 font-mono"
        rows={16}
      />

      {parseError ? (
        <p role="alert" className="mt-1.5 text-[13px] font-medium text-[var(--danger)]">
          {parseError}
          <span className="mt-0.5 block text-[11px] font-normal">
            常见原因：多余的尾逗号、用了单引号、键名没加双引号。可以点「格式化」定位问题位置。
          </span>
        </p>
      ) : null}

      <p id="json-editor-help" className="mt-1.5 text-[11px] leading-relaxed text-[var(--subtle)]">
        这里直接编辑原始 JSON，没有可视化表单。解析失败时这次改动不会同步到待保存内容，
        保存按钮提交的仍是上一次解析成功的版本，因此请先把格式改对再保存。
      </p>
    </div>
  );
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  meta?: string;
  /** 该条回复对应的服务端 trace（用于打分与沉淀）；LLM 未配置或调用失败时为空 */
  traceId?: string | null;
  rating?: "UP" | "DOWN" | null;
  /** 已沉淀为评测用例 */
  promoted?: boolean;
}

/** 沉淀用例时可选的确定性断言类型（与 schemas.ts 的 evalAssertionSchema 对应） */
type AssertionType = "contains" | "not_contains" | "regex";

const ASSERTION_LABELS: Record<AssertionType, string> = {
  contains: "包含",
  not_contains: "不含",
  regex: "正则",
};

const ASSERTION_PLACEHOLDERS: Record<AssertionType, string> = {
  contains: "例：systemctl restart",
  not_contains: "例：密码",
  regex: "例：快照|snapshot",
};

/** 试聊 Playground：加载该 Agent 当前 Prompt 配置真实调用 MiMo，会话仅存前端内存 */
function ChatPlayground({ agentId }: { agentId: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  /** 正在打分/沉淀的 traceId（防重复提交） */
  const [actingId, setActingId] = useState<string | null>(null);
  /** 行内沉淀表单展开的 assistant 消息索引 */
  const [promotingIdx, setPromotingIdx] = useState<number | null>(null);
  const [expectation, setExpectation] = useState("");
  /** 沉淀时配置的确定性断言：发布评测先跑断言，未全过则跳过模型判官 */
  const [assertions, setAssertions] = useState<Array<{ type: AssertionType; value: string }>>([]);
  const [actionMsg, setActionMsg] = useState("");
  const [actionErr, setActionErr] = useState("");

  const send = async () => {
    const message = input.trim();
    if (!message || sending) return;
    setSending(true);
    setErr("");
    setActionMsg("");
    setActionErr("");
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    try {
      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: d.reply,
            meta: `${d.model} · ${d.latencyMs}ms · ${d.usage?.totalTokens ?? 0} tokens`,
            traceId: d.traceId ?? null,
            rating: null,
            promoted: false,
          },
        ]);
      } else {
        setErr(json.error || "调用失败");
      }
    } catch {
      setErr("网络错误");
    } finally {
      setSending(false);
    }
  };

  /** 给某条回复打分（👍 / 👎），打分结果写回服务端 trace */
  const rate = async (msg: ChatMsg, rating: "UP" | "DOWN") => {
    if (!msg.traceId || actingId) return;
    setActingId(msg.traceId);
    setActionMsg("");
    setActionErr("");
    try {
      const res = await fetch(`/api/traces/${msg.traceId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      const json = await res.json();
      if (json.success) {
        setMessages((prev) =>
          prev.map((m) => (m.traceId === msg.traceId ? { ...m, rating } : m)),
        );
        setActionMsg(
          rating === "UP"
            ? "已标记「有帮助」——可以继续沉淀为评测用例"
            : "已标记「需改进」——建议沉淀为评测用例并在下一次发布时重点验证",
        );
      } else {
        setActionErr(json.error || "打分失败");
      }
    } catch {
      setActionErr("网络错误");
    } finally {
      setActingId(null);
    }
  };

  /** 确认沉淀：把该条 trace 写入评测用例库 */
  const confirmPromote = async (msg: ChatMsg, idx: number) => {
    if (!msg.traceId || actingId) return;
    setActingId(msg.traceId);
    setActionErr("");
    try {
      const res = await fetch(`/api/agents/${agentId}/eval-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          traceId: msg.traceId,
          expectation: expectation.trim() || undefined,
          // 内容为空的断言行直接丢弃；全部为空则不传（服务端按未配置断言处理）
          assertions: assertions.some((a) => a.value.trim())
            ? assertions
                .filter((a) => a.value.trim())
                .map((a) => ({ type: a.type, value: a.value.trim() }))
            : undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessages((prev) =>
          prev.map((m, i) => (i === idx ? { ...m, promoted: true } : m)),
        );
        setPromotingIdx(null);
        setActionMsg("已沉淀为评测用例：发布前 AI 评测会自动覆盖这个场景");
      } else {
        setActionErr(json.error || "沉淀失败");
      }
    } catch {
      setActionErr("网络错误");
    } finally {
      setActingId(null);
    }
  };

  return (
    <section className="mt-8" aria-labelledby="playground-heading">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="playground-heading" className="text-sm font-semibold text-[var(--foreground)]">
          试聊 Playground
        </h2>
        <Badge tone="success" title="这里是真实的模型调用，不是 mock 数据">
          LIVE
        </Badge>
        <span className="text-[11px] text-[var(--subtle)]">
          加载当前 Prompt 分区配置真实调用模型；改完配置立即可验
        </span>
      </div>

      <Hint className="mt-1 max-w-3xl">
        用它在提交审批之前先验一遍改动效果：上面保存过的草稿配置会立即被这里使用，不需要等发布。
        每次成功回复都会在服务端落盘为一条 trace；给回复打分后可以一键沉淀为评测用例——
        下次提交发布时，AI 评测会用待发布配置重放这些用例做回归检查。
        会话历史本身仍只存在当前页面内存里，刷新即清空。
      </Hint>

      <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        {messages.length === 0 ? (
          <p className="py-4 text-center text-xs text-[var(--subtle)]">
            输入一条工单消息，用当前配置试聊（真实调用）
          </p>
        ) : (
          <div className="max-h-96 space-y-3 overflow-y-auto" role="log" aria-live="polite" aria-label="试聊对话记录">
            {messages.map((m, idx) => (
              <div key={idx} className={m.role === "user" ? "flex justify-end" : ""}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap sm:max-w-[80%] ${
                    m.role === "user"
                      ? "bg-[var(--accent-muted)] text-[var(--foreground)]"
                      : "border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                  }`}
                >
                  <span className="sr-only">{m.role === "user" ? "你说：" : "Agent 回复："}</span>
                  {m.content}
                  {m.meta && (
                    <p
                      className="mt-1 text-[10px] tabular-nums text-[var(--subtle)]"
                      title="实际使用的模型 · 端到端耗时 · 本轮消耗的 token 总数"
                    >
                      {m.meta}
                    </p>
                  )}
                  {m.role === "assistant" && m.traceId && (
                    // data-chat-actions：chrome-extension 提取对话证据时整体剔除打分/沉淀操作区，勿删
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5" data-chat-actions>
                      <button
                        type="button"
                        onClick={() => rate(m, "UP")}
                        disabled={actingId === m.traceId}
                        aria-pressed={m.rating === "UP"}
                        title="这条回复正确解决了问题——可沉淀为评测用例做回归"
                        className={`rounded-md border px-1.5 py-0.5 text-[11px] transition-colors disabled:opacity-50 ${
                          m.rating === "UP"
                            ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]"
                            : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        {m.rating === "UP" ? "✓ 有帮助" : "有帮助"}
                      </button>
                      <button
                        type="button"
                        onClick={() => rate(m, "DOWN")}
                        disabled={actingId === m.traceId}
                        aria-pressed={m.rating === "DOWN"}
                        title="这条回复有问题——沉淀为用例后可在发布评测中防止回归"
                        className={`rounded-md border px-1.5 py-0.5 text-[11px] transition-colors disabled:opacity-50 ${
                          m.rating === "DOWN"
                            ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]"
                            : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        {m.rating === "DOWN" ? "✕ 需改进" : "需改进"}
                      </button>
                      {!m.promoted && m.rating && promotingIdx !== idx && (
                        <button
                          type="button"
                          onClick={() => {
                            setPromotingIdx(idx);
                            setExpectation("");
                            setAssertions([]);
                            setActionErr("");
                          }}
                          className="rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--accent)] transition-colors hover:bg-[var(--surface-elevated)]"
                          title="沉淀为评测用例：发布前 AI 评测将重放该场景并与本回复对比"
                        >
                          沉淀为评测用例
                        </button>
                      )}
                      {m.promoted && (
                        <span
                          className="rounded-md border border-[var(--success-border)] bg-[var(--success-bg)] px-1.5 py-0.5 text-[11px] text-[var(--success)]"
                          title="该回复已进入评测语料库，发布 AI 评测会自动覆盖此场景"
                        >
                          ✓ 已沉淀
                        </span>
                      )}
                    </div>
                  )}
                  {promotingIdx === idx && (
                    <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] p-2" data-chat-actions>
                      <p className="text-[11px] text-[var(--muted)]">
                        期望行为（可选）：AI 评测将据此判断新配置是否达标
                      </p>
                      <textarea
                        autoFocus
                        value={expectation}
                        onChange={(e) => setExpectation(e.target.value)}
                        rows={2}
                        placeholder="例：先给出排查步骤，涉及高危操作前提醒风险"
                        className="mt-1 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
                      />
                      <div className="mt-2">
                        <p className="text-[11px] text-[var(--muted)]">
                          确定性断言（可选，最多 5 条）：发布评测先跑断言，全部通过才调用模型判官
                        </p>
                        {assertions.map((a, i) => (
                          <div key={i} className="mt-1 flex items-center gap-1.5">
                            <label className="sr-only" htmlFor={`assertion-type-${i}`}>
                              断言 {i + 1} 的类型
                            </label>
                            <Select
                              id={`assertion-type-${i}`}
                              value={a.type}
                              onChange={(e) =>
                                setAssertions((prev) =>
                                  prev.map((p, j) =>
                                    j === i ? { ...p, type: e.target.value as AssertionType } : p,
                                  ),
                                )
                              }
                              className="w-20 shrink-0 text-xs"
                              title="断言类型：包含=回复须含有该内容；不含=回复不得出现该内容；正则=回复须匹配该正则"
                            >
                              {(Object.keys(ASSERTION_LABELS) as AssertionType[]).map((t) => (
                                <option key={t} value={t}>
                                  {ASSERTION_LABELS[t]}
                                </option>
                              ))}
                            </Select>
                            <Input
                              value={a.value}
                              onChange={(e) =>
                                setAssertions((prev) =>
                                  prev.map((p, j) =>
                                    j === i ? { ...p, value: e.target.value } : p,
                                  ),
                                )
                              }
                              maxLength={200}
                              placeholder={ASSERTION_PLACEHOLDERS[a.type]}
                              aria-label={`断言 ${i + 1} 的内容`}
                              className="min-w-0 flex-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setAssertions((prev) => prev.filter((_, j) => j !== i))
                              }
                              aria-label={`删除断言 ${i + 1}`}
                              title="删除这条断言"
                              className="shrink-0 rounded px-1 text-xs text-[var(--muted)] transition-colors hover:text-[var(--danger)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        {assertions.length < 5 && (
                          <button
                            type="button"
                            onClick={() =>
                              setAssertions((prev) => [...prev, { type: "contains", value: "" }])
                            }
                            className="mt-1 rounded text-[11px] text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
                          >
                            + 添加断言
                          </button>
                        )}
                      </div>
                      <div className="mt-1.5 flex gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => confirmPromote(m, idx)}
                          loading={actingId === m.traceId}
                          loadingText="沉淀中…"
                        >
                          确认沉淀
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setPromotingIdx(null)}>
                          取消
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <p className="text-xs text-[var(--subtle)]" role="status">模型思考中…</p>
            )}
          </div>
        )}

        {err && (
          <Alert tone="danger" title="试聊调用失败" className="mt-2">
            {err}
            <span className="mt-1 block text-xs">
              可能是模型服务未配置或密钥失效。可以到「模型服务」页做一次连通性探测，确认后再回来重试。
            </span>
          </Alert>
        )}
        {actionMsg && (
          <p role="status" className="mt-2 text-xs font-medium text-[var(--success)]">
            {actionMsg}
          </p>
        )}
        {actionErr && (
          <Alert tone="danger" title="操作失败" className="mt-2">
            {actionErr}
            <span className="mt-1 block text-xs">
              打分或沉淀未生效。可以刷新页面后在下方评测用例库里确认当前状态。
            </span>
          </Alert>
        )}

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Field
            label="试聊消息"
            hideLabel
            className="flex-1"
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="e.g. ECS 实例无法 SSH 连接，怎么排查？"
              />
            )}
          </Field>
          <Button
            variant="primary"
            onClick={send}
            disabled={!input.trim()}
            loading={sending}
            loadingText="调用中…"
            className="sm:w-auto"
          >
            发送
          </Button>
        </div>
        <Hint className="mt-2">
          按 Enter 发送，Shift + Enter 换行。提问越接近真实工单，越能暴露配置问题；对回复打分后可沉淀为回归用例。
        </Hint>
      </div>
    </section>
  );
}
