import type { ReactNode } from "react";
import Link from "next/link";

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
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">{subtitle}</p>
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
          <span className="shrink-0 text-[11px] text-[var(--subtle)]" title="本节内容的出处，可回到源文件核对">
            来源：{source}
          </span>
        ) : null}
      </div>
      {description ? (
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-[var(--muted)]">
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

/**
 * 表格（带表头深色背景）。
 * caption 以 sr-only 呈现，让读屏器在进入表格时先听到这张表在讲什么；
 * 窄屏下横向滚动容器加 tabIndex，键盘用户才能滚到右侧被裁掉的列。
 */
export function Table({
  head,
  rows,
  caption,
}: {
  head: string[];
  rows: ReactNode[][];
  /** 这张表在说明什么。留空时回退为通用描述 */
  caption?: string;
}) {
  return (
    <div
      className="overflow-x-auto rounded-lg ring-1 ring-[var(--border)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]"
      tabIndex={0}
      role="region"
      aria-label={caption ?? "数据表格，窄屏下可左右滚动查看完整列"}
    >
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">
          {caption ?? `共 ${rows.length} 行，${head.length} 列：${head.join("、")}`}
        </caption>
        <thead>
          <tr className="bg-[var(--surface-elevated)]">
            {head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className="border-b border-[var(--border)] px-3.5 py-2.5 text-left font-semibold whitespace-nowrap text-[var(--foreground)]"
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
                  className="px-3.5 py-2.5 align-top leading-relaxed text-[var(--muted)]"
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
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "accent";
  /** 悬浮解释：这个标记代表什么 */
  title?: string;
}) {
  // 统一走语义 token，两套主题的对比度已在 globals.css 一处校准，
  // 不再各写一遍 dark: 变体（此前亮色下 zinc-500 / red-500 均不达 4.5:1）
  const tones: Record<string, string> = {
    neutral: "bg-[var(--surface-elevated)] text-[var(--muted)]",
    good: "bg-[var(--success-bg)] text-[var(--success)]",
    warn: "bg-[var(--warn-bg)] text-[var(--warn)]",
    bad: "bg-[var(--danger-bg)] text-[var(--danger)]",
    accent: "bg-[var(--accent-muted)] text-[var(--accent)]",
  };
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]} ${
        title ? "cursor-help" : ""
      }`}
    >
      {children}
    </span>
  );
}

/** 评分点（0-5 圆点） */
export function ScoreDots({ score, max = 5 }: { score: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${score}/${max}`}>
      <span className="sr-only">
        评分 {score} 分，满分 {max} 分
      </span>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          aria-hidden="true"
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
        <Link
          key={it.href}
          href={it.href}
          className="group rounded-lg bg-[var(--surface)] p-5 ring-1 ring-[var(--border)] transition hover:ring-[var(--accent)]/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--foreground)] group-hover:text-[var(--accent)]">
              {it.title}
            </h3>
            {it.tag ? <Pill tone="accent">{it.tag}</Pill> : null}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{it.description}</p>
        </Link>
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
  // 轻量强调已由着色底 + 强调色标题承载，不再叠加左侧粗色条（过于抢眼且与卡片边框语汇重叠）
  return (
    <aside
      aria-label={label}
      className="mt-4 rounded-lg bg-[var(--accent-muted)]/30 px-4 py-3 ring-1 ring-[var(--accent)]/20"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
        {label}
      </p>
      <div className="mt-1 text-[13px] leading-relaxed text-[var(--foreground)]">
        {children}
      </div>
    </aside>
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
            className="rounded font-medium text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            {it.title}
            <span className="sr-only">（在新标签页打开）</span>
          </a>
          {it.note ? <span className="text-[var(--subtle)]"> — {it.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}
