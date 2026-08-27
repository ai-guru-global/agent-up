"use client";

/**
 * 全站共享的展示型基元组件。
 *
 * 建立此文件前，按钮、卡片、徽章、空状态在 10 个页面里各自用裸 Tailwind
 * 拼装，同一语义出现了 rounded-md / rounded-lg、p-4 / p-5、border-red-200
 * bg-red-50 / bg-red-500-10 等多套写法。这里收敛为单一出处，颜色全部走
 * globals.css 的语义 token，不再出现硬编码色值。
 */

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { metaOf, type StatusMeta, type Tone } from "./status";

/** 微型 className 合并：过滤掉 false / undefined，避免引入 clsx 依赖 */
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ tone */

/** tone → 语义色。文字色 / 底色 / 边框色成对给出，两套主题都已验证对比度 */
const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-[var(--muted)]",
  info: "text-[var(--accent)]",
  success: "text-[var(--success)]",
  warn: "text-[var(--warn)]",
  danger: "text-[var(--danger)]",
  accent: "text-[var(--accent)]",
};

const TONE_SOFT: Record<Tone, string> = {
  neutral: "bg-[var(--surface-elevated)] text-[var(--muted)] border-[var(--border)]",
  info: "bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--accent-muted)]",
  success: "bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]",
  warn: "bg-[var(--warn-bg)] text-[var(--warn)] border-[var(--warn-border)]",
  danger: "bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger-border)]",
  accent: "bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--accent-muted)]",
};

export { TONE_TEXT, TONE_SOFT };

/* ---------------------------------------------------------------- Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium " +
  "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent)] text-white hover:brightness-110",
  secondary:
    "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-elevated)]",
  ghost: "text-[var(--muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)]",
  danger:
    "border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)] hover:brightness-95 dark:hover:brightness-125",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-9 px-3.5 text-[13px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 进行中：自动禁用并显示转圈，文案由调用方通过 loadingText 指定 */
  loading?: boolean;
  loadingText?: string;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  loadingText,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)}
      {...rest}
    >
      {loading && <Spinner />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

/** 纯图标按钮：强制要求 label，避免出现读屏器读不出的裸图标按钮 */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 无障碍名称，同时作为悬浮提示 */
  label: string;
  children: ReactNode;
}

export function IconButton({ label, className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type={rest.type ?? "button"}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)]",
        "transition-colors duration-150 hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}

/* ----------------------------------------------------------------- Badge */

export interface BadgeProps {
  tone?: Tone;
  /** 悬浮解释：这个状态意味着什么 */
  title?: string;
  /** 原始枚举码。以更小字号作为后缀保留，界面上不丢失任何原有可见文本 */
  code?: string;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = "neutral", title, code, className, children }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none",
        TONE_SOFT[tone],
        title && "cursor-help",
        className,
      )}
    >
      {children}
      {/* 括号不能省：只靠 margin / gap 做视觉间距时，可访问名称会被算成
          “已分诊TRIAGED” 这种粘连串，读屏无法读出两个词 */}
      {code && <span className="font-mono text-[10px] uppercase opacity-75">（{code}）</span>}
    </span>
  );
}

/**
 * 状态徽章：从字典取中文标签 + tone + 解释，并把原始枚举码作为后缀保留。
 * 中文是主显示，英文码仍然可见，任何既有的 NEW / IN_PROGRESS 文本都不会消失。
 */
export function StatusBadge({
  dict,
  code,
  showCode = true,
  className,
}: {
  dict: Record<string, StatusMeta>;
  code: string | null | undefined;
  showCode?: boolean;
  className?: string;
}) {
  const meta = metaOf(dict, code);
  return (
    <Badge tone={meta.tone} title={meta.desc} code={showCode && code ? code : undefined} className={className}>
      {meta.label}
    </Badge>
  );
}

/* ------------------------------------------------------------------ Card */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 内边距档位统一为三档，杜绝 p-4 / p-5 混用 */
  pad?: "none" | "sm" | "md";
  /** 悬浮微抬升，仅用于可点击的卡片 */
  interactive?: boolean;
}

const CARD_PAD = { none: "", sm: "p-4", md: "p-5" } as const;

export function Card({ pad = "md", interactive = false, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--border)] bg-[var(--surface)]",
        CARD_PAD[pad],
        interactive &&
          "transition-colors duration-150 hover:border-[var(--accent)] hover:bg-[var(--surface-elevated)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- PageHeader */

export interface PageHeaderProps {
  title: string;
  /** 副标题：这个页面负责什么。所有主页面都应有，避免用户猜页面用途 */
  description?: ReactNode;
  /** 更长的补充说明，例如流程顺序、数据来源、术语解释 */
  hint?: ReactNode;
  actions?: ReactNode;
  /** 面包屑或返回入口 */
  above?: ReactNode;
}

export function PageHeader({ title, description, hint, actions, above }: PageHeaderProps) {
  return (
    <header className="mb-6">
      {above && <div className="mb-2">{above}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">{title}</h1>
          {description && (
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {hint && (
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[var(--subtle)]">{hint}</p>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ Hint */

/**
 * 行内解释文案的统一载体。用于承载"这个字段是什么""这个按钮会做什么"，
 * 是本轮补充说明性内容的主要容器。
 */
export function Hint({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p className={cn("text-xs leading-relaxed text-[var(--subtle)]", className)}>{children}</p>
  );
}

/** 带 ? 标记的术语提示，悬浮显示释义 */
export function Term({ label, explain }: { label: string; explain: string }) {
  return (
    <span
      title={explain}
      className="cursor-help border-b border-dotted border-[var(--muted)] text-[var(--muted)]"
    >
      {label}
    </span>
  );
}

/**
 * 列表上方的计数说明。
 *
 * 加载失败时数组必然是空的，直接渲染「共 0 个 X」会把「没能取到」说成
 * 「一个都没有」，与同屏的错误提示直接矛盾。这类假断言比缺文案更难发现，
 * 因为界面看起来完全正常。出错时统一走 unknown 分支，不报具体数字。
 */
export function CountLine({
  error,
  unknown,
  className,
  children,
}: {
  error?: boolean;
  /** 出错时代替整句的说明，要点是「取不到」而不是「没有」 */
  unknown: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return <Hint className={className}>{error ? unknown : children}</Hint>;
}

/* ----------------------------------------------------------------- Alert */

export interface AlertProps {
  tone?: Tone;
  /** 标题行，例如「操作失败」 */
  title?: ReactNode;
  /**
   * 给了就会在提示末尾渲染一个重试按钮。
   * 加载失败的文案里写「请重试」却不给入口，等于让用户去做界面上不存在的事；
   * 凡是重新拉一次数据就能恢复的区域，都应该把这个回调传进来。
   */
  onRetry?: () => void;
  /** 重试按钮的文字，默认「重试」；同屏可能有多个可重试区域时，给更具体的说法 */
  retryLabel?: string;
  /** 按钮之外的补充说明，例如「重试会重新请求列表接口」 */
  retryHint?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Alert({
  tone = "danger",
  title,
  onRetry,
  retryLabel = "重试",
  retryHint,
  className,
  children,
}: AlertProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed",
        TONE_SOFT[tone],
        className,
      )}
    >
      {title && <div className="font-semibold">{title}</div>}
      <div className={title ? "mt-0.5" : undefined}>{children}</div>
      {onRetry && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {/* Button 默认 type="button"，放在登录等表单里不会误触发提交 */}
          <Button size="sm" variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
          {retryHint && <span className="text-xs opacity-80">{retryHint}</span>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- EmptyState */

export interface EmptyStateProps {
  title: string;
  /** 为什么这里是空的，以及接下来该做什么 */
  description?: ReactNode;
  action?: ReactNode;
  /** 补充说明，例如数据来源或前置条件 */
  hint?: ReactNode;
  className?: string;
  /**
   * 标题的元素层级，默认 p。
   * 当空状态直接 return 掉整个页面（页面里已经不会再有 PageHeader）时必须传 h1，
   * 否则该 URL 的文档就没有任何顶级标题，读屏与键盘用户无法定位。
   * 嵌在正常页面里的空状态保持默认，以免一页出现多个 h1。
   */
  titleAs?: "p" | "h1" | "h2";
}

export function EmptyState({
  title,
  description,
  action,
  hint,
  className,
  titleAs = "p",
}: EmptyStateProps) {
  const Title = titleAs;
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center",
        className,
      )}
    >
      <Title className={cn("font-medium text-[var(--foreground)]", titleAs === "p" ? "text-sm" : "text-base")}>{title}</Title>
      {description && (
        <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-[var(--muted)]">
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
      {hint && (
        <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-[var(--subtle)]">{hint}</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Skeleton */

/** 加载骨架。带 role=status 让读屏器知道内容正在载入 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded bg-[var(--surface-elevated)]", className)}
      aria-hidden="true"
    />
  );
}

export function LoadingBlock({ label = "加载中…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-4 w-80" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}

/* --------------------------------------------------------------- 其他小件 */

/** 区块标题 + 可选说明，用于页面内分节 */
export function SectionTitle({
  title,
  description,
  actions,
  as: As = "h2",
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <As className="text-sm font-semibold tracking-tight text-[var(--foreground)]">{title}</As>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--subtle)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** MOCK / 未接入真实数据 的统一标注 */
export function MockTag({ note }: { note?: string }) {
  return (
    <span
      title={note ?? "该功能使用本地 mock 数据，未接入真实后端"}
      className="inline-flex cursor-help items-center rounded bg-[var(--warn-bg)] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--warn)]"
    >
      MOCK
    </span>
  );
}

/** 键值对：左侧字段名（可带解释），右侧值 */
export function KeyValue({
  label,
  explain,
  children,
}: {
  label: string;
  explain?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="shrink-0 text-xs text-[var(--subtle)]">
        {explain ? <Term label={label} explain={explain} /> : label}
      </dt>
      <dd className="min-w-0 text-right text-[13px] text-[var(--foreground)]">{children}</dd>
    </div>
  );
}
