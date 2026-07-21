import type { ReactNode } from "react";

/** 页面标题区 */
export function PageHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
          {title}
        </h1>
        {badge ? (
          <span className="rounded-full bg-[var(--accent-muted)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--accent)]">
            {badge}
          </span>
        ) : null}
      </div>
      {subtitle ? (
        <p className="mt-1.5 max-w-2xl text-sm text-zinc-500">{subtitle}</p>
      ) : null}
    </div>
  );
}

/** 章节标题 */
export function Section({
  title,
  description,
  children,
  source,
}: {
  title: string;
  description?: string;
  source?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-semibold text-[var(--foreground)]">{title}</h2>
        {source ? (
          <span className="shrink-0 text-[11px] text-zinc-400">来源：{source}</span>
        ) : null}
      </div>
      {description ? (
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-zinc-500">
          {description}
        </p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** 通用卡片 */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg bg-[var(--surface)] p-5 ring-1 ring-[var(--border)] ${className}`}
    >
      {children}
    </div>
  );
}

/** 表格（带表头深色背景） */
export function Table({
  head,
  rows,
}: {
  head: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-[var(--border)]">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-[var(--surface-elevated)]">
            {head.map((h, i) => (
              <th
                key={i}
                className="border-b border-[var(--border)] px-3.5 py-2.5 text-left font-semibold text-[var(--foreground)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-[var(--surface)]">
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-elevated)]/40"
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-3.5 py-2.5 align-top text-zinc-600 dark:text-zinc-300"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 状态标签 */
export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "accent";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-zinc-500/10 text-zinc-500",
    good: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bad: "bg-red-500/10 text-red-500 dark:text-red-400",
    accent: "bg-[var(--accent-muted)] text-[var(--accent)]",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** 评分点（0-5 圆点） */
export function ScoreDots({ score, max = 5 }: { score: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${score}/${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i < score ? "bg-[var(--accent)]" : "bg-[var(--border)]"
          }`}
        />
      ))}
    </span>
  );
}

/** 子导航卡片（用于在各架构页面之间跳转） */
export function NavGrid({
  items,
}: {
  items: { title: string; description: string; href: string; tag?: string }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <a
          key={it.href}
          href={it.href}
          className="group rounded-lg bg-[var(--surface)] p-5 ring-1 ring-[var(--border)] transition hover:ring-[var(--accent)]/40"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--foreground)] group-hover:text-[var(--accent)]">
              {it.title}
            </h3>
            {it.tag ? <Pill tone="accent">{it.tag}</Pill> : null}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{it.description}</p>
        </a>
      ))}
    </div>
  );
}

/** 关键洞察框 */
export function Insight({
  children,
  label = "关键洞察",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div className="mt-4 rounded-lg border-l-2 border-[var(--accent)] bg-[var(--accent-muted)]/30 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
        {label}
      </p>
      <div className="mt-1 text-[13px] leading-relaxed text-[var(--foreground)]">
        {children}
      </div>
    </div>
  );
}

/** 参考来源列表（带可点击链接） */
export function References({
  items,
}: {
  items: { title: string; url: string; note?: string }[];
}) {
  return (
    <ul className="mt-4 space-y-1.5">
      {items.map((it) => (
        <li key={it.url} className="text-[12px] leading-relaxed">
          <a
            href={it.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--accent)] hover:underline"
          >
            {it.title}
          </a>
          {it.note ? <span className="text-zinc-400"> — {it.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}
