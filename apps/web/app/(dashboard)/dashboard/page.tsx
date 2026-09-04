"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Alert,
  Card,
  EmptyState,
  Hint,
  PageHeader,
  SectionTitle,
  Skeleton,
  StatusBadge,
  FEEDBACK_STATUS,
  RELEASE_STATUS,
  SEVERITY,
  metaOf,
} from "@/components/ui";

interface DashboardData {
  agents: { total: number; active: number };
  feedback: { total: number; pending: number };
  releases: { pending: number };
  recentFeedback: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    submittedAt: string;
    agent: { id: string; name: string } | null;
  }>;
  recentReleases: Array<{
    id: string;
    agentId: string;
    changeNote: string;
    status: string;
    submittedAt: string;
    submittedBy: string;
    agent: { id: string; name: string } | null;
  }>;
}

export default function DashboardHome() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      if (json.success) setData(json.data);
      else setError(json.error || "加载失败");
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, []);

  // 拉取前同步重置 loading/error 是有意的；setState 均在 await 前完成，无级联风险
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { fetchOverview(); }, [fetchOverview]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (error) {
    return (
      <div>
        <PageHeader
          title="工作台"
          description="全局概览：一眼看清有多少 Agent 在跑、有多少反馈等着分诊、有多少变更卡在审批。"
        />
        <Alert
          tone="danger"
          title="概览数据加载失败"
          onRetry={fetchOverview}
          retryHint="点这里会重新汇总一次概览数据，不用刷新整个页面。"
        >
          {error}
          <span className="mt-1 block text-xs">
            概览数据来自 /api/dashboard，它会汇总 apps/web/data/ 下的 agents、feedback、releases
            三类 JSON。请确认这些文件仍是合法 JSON，然后刷新页面重试。
          </span>
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">正在加载工作台概览数据</span>
        <Skeleton className="h-8 w-24" />
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  const d = data ?? {
    agents: { total: 0, active: 0 },
    feedback: { total: 0, pending: 0 },
    releases: { pending: 0 },
    recentFeedback: [],
    recentReleases: [],
  };

  return (
    <div>
      <PageHeader
        title="工作台"
        description="全局概览：一眼看清有多少 Agent 在跑、有多少反馈等着分诊、有多少变更卡在审批。"
        hint={
          <>
            平台的日常动线是「反馈进来 → 归因到四分区 → 改配置 → 提交发布审批 → 生成版本快照」。
            下面的四个指标对应这条动线上最容易堵住的环节，数字带下划色的表示需要你介入。
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Agent"
          value={d.agents.total}
          sub={`其中 ${d.agents.active} 个已上线（active）`}
          explain="平台上登记的 Agent 总数，含草稿、已上线与已归档"
        />
        <StatCard
          label="待处理反馈"
          value={d.feedback.pending}
          sub={`待处理 ${d.feedback.pending} 条 / 历史共 ${d.feedback.total} 条`}
          accent
          explain="尚未流转到「已解决」的反馈数量，是改进环的输入队列"
        />
        <StatCard
          label="待审批"
          value={d.releases.pending}
          sub="Release（待裁决的配置变更提交）"
          accent={d.releases.pending > 0}
          explain="已提交但还没裁决的配置变更，卡在这里的变更不会生效"
        />
        <StatCard
          label="活跃 Agent"
          value={d.agents.active}
          sub="已发布（状态 ACTIVE）"
          explain="状态为 ACTIVE、正在对外提供服务的 Agent 数量"
        />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section aria-labelledby="recent-feedback-heading">
          <div className="flex items-baseline justify-between">
            <h2
              id="recent-feedback-heading"
              className="text-sm font-semibold text-[var(--foreground)]"
            >
              最新反馈
            </h2>
            <Link
              href="/feedback/"
              className="rounded text-xs text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            >
              查看全部
              {/* 本页有两个“查看全部”，读屏列链接时无法区分，补一段只给辅助技术的目标说明 */}
              <span className="sr-only">最新反馈</span>
            </Link>
          </div>
          <Hint className="mt-1">
            按提交时间倒序的最近若干条。右侧徽章是严重程度，鼠标悬停可看到该等级的判定标准。
          </Hint>
          <div className="mt-3 divide-y divide-[var(--border)]">
            {d.recentFeedback.length === 0 ? (
              <EmptyState
                className="border-0 px-0 py-10"
                title="暂无反馈"
                description="还没有人提交过反馈。反馈是整个改进环的起点，可以先到反馈中心录入一条真实的对话问题。"
              />
            ) : (
              d.recentFeedback.map((fb) => (
                <div key={fb.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm text-[var(--foreground)]">{fb.title}</h3>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--subtle)]">
                      <span>{fb.agent?.name ?? "未关联 Agent"}</span>
                      <span aria-hidden="true">/</span>
                      <time dateTime={fb.submittedAt}>
                        {new Date(fb.submittedAt).toLocaleDateString("zh-CN")}
                      </time>
                      <span aria-hidden="true">/</span>
                      <span title={metaOf(FEEDBACK_STATUS, fb.status).desc} className="cursor-help">
                        {metaOf(FEEDBACK_STATUS, fb.status).label}
                      </span>
                    </div>
                  </div>
                  <StatusBadge dict={SEVERITY} code={fb.severity} className="shrink-0" />
                </div>
              ))
            )}
          </div>
        </section>

        <section aria-labelledby="recent-releases-heading">
          <div className="flex items-baseline justify-between">
            <h2
              id="recent-releases-heading"
              className="text-sm font-semibold text-[var(--foreground)]"
            >
              最新发布
            </h2>
            <Link
              href="/releases/"
              className="rounded text-xs text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            >
              查看全部
              <span className="sr-only">最新发布</span>
            </Link>
          </div>
          <Hint className="mt-1">
            每条记录是一次配置变更的提交。点 Agent 名可以进入详情查看四分区的具体改动。
          </Hint>
          <div className="mt-3 divide-y divide-[var(--border)]">
            {d.recentReleases.length === 0 ? (
              <EmptyState
                className="border-0 px-0 py-10"
                title="暂无发布记录"
                description="还没有任何配置变更被提交审批。在 Agent 详情页修改四分区配置并保存后，会自动生成一条待审批记录。"
              />
            ) : (
              d.recentReleases.map((rel) => (
                <div key={rel.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/agents/${rel.agentId}/`}
                      className="truncate rounded text-sm text-[var(--foreground)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                    >
                      {rel.agent?.name ?? rel.agentId}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-[var(--subtle)]">{rel.changeNote}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--subtle)]">
                      由 {rel.submittedBy} 提交于{" "}
                      <time dateTime={rel.submittedAt}>
                        {new Date(rel.submittedAt).toLocaleDateString("zh-CN")}
                      </time>
                    </p>
                  </div>
                  <StatusBadge dict={RELEASE_STATUS} code={rel.status} className="shrink-0" />
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="mt-10">
        <SectionTitle
          title="常用入口"
          description="按改进环的顺序排列：先看有什么问题，再改配置，最后把变更放行。"
        />
        <div className="flex flex-wrap gap-3">
          <Link
            href="/agents/"
            className="inline-flex h-9 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            管理 Agent
          </Link>
          <Link
            href="/feedback/"
            className="inline-flex h-9 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            处理反馈
          </Link>
          <Link
            href="/releases/"
            className="inline-flex h-9 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            审批发布
          </Link>
          <Link
            href="/architecture/"
            className="inline-flex h-9 items-center rounded-md px-3.5 text-[13px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            第一次使用？先看架构总览
          </Link>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
  explain,
}: {
  label: string;
  value: number;
  sub: string;
  accent?: boolean;
  /** 这个指标怎么算出来的、为什么值得看 */
  explain: string;
}) {
  return (
    <Card pad="md" className="min-w-0">
      <p className="text-xs font-medium text-[var(--muted)]" title={explain}>
        {label}
      </p>
      <p
        data-numeric
        className={`mt-1 text-2xl font-semibold ${
          accent ? "text-[var(--accent)]" : "text-[var(--foreground)]"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-[var(--subtle)]">{sub}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--subtle)]">{explain}</p>
    </Card>
  );
}
