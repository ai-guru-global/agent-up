"use client";

/**
 * 表单基元。
 *
 * 建立此文件前，agents 页的搜索框与状态筛选、feedback 页的两个筛选下拉都
 * 没有 label，读屏器只能读出「编辑框」；错误提示的样式也各写一套。
 * 这里统一 label ↔ 控件的 id 关联、必填标记、说明文案位、错误提示位。
 */

import { useId } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "./primitives";

const CONTROL_BASE =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[13px] " +
  "text-[var(--foreground)] placeholder:text-[var(--subtle)] " +
  "transition-colors duration-150 hover:border-[var(--muted)] " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export interface FieldProps {
  label: string;
  /** 这个字段是什么、填什么、影响什么 —— 显示在控件下方 */
  hint?: ReactNode;
  /** 校验错误。出现时用 role=alert 播报 */
  error?: string | null;
  required?: boolean;
  /** 视觉上隐藏 label，但读屏器仍可读到（用于工具栏里的筛选控件） */
  hideLabel?: boolean;
  className?: string;
  /** 接收 { id, describedBy } 渲染控件 */
  children: (props: { id: string; describedBy: string | undefined }) => ReactNode;
}

export function Field({
  label,
  hint,
  error,
  required = false,
  hideLabel = false,
  className,
  children,
}: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={id}
        className={cn(
          "block text-xs font-medium text-[var(--muted)]",
          hideLabel && "sr-only",
        )}
      >
        {label}
        {required && (
          <span className="ml-0.5 text-[var(--danger)]" title="必填项">
            *
          </span>
        )}
      </label>
      {children({ id, describedBy })}
      {hint && (
        <p id={hintId} className="text-[11px] leading-relaxed text-[var(--subtle)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-[11px] font-medium text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL_BASE, "h-9", className)} {...rest} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CONTROL_BASE, "h-9 pr-1.5", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL_BASE, "py-2 leading-relaxed", className)} {...rest} />;
}

/** 表单底部动作区：右对齐，移动端撑满 */
export function FormActions({
  children,
  hint,
}: {
  children: ReactNode;
  /** 提交前的最后一句提示，例如「提交后会进入发布审批，不会立即生效」 */
  hint?: ReactNode;
}) {
  return (
    <div className="mt-5 flex flex-col gap-2 border-t border-[var(--border)] pt-4">
      {hint && <p className="text-[11px] leading-relaxed text-[var(--subtle)]">{hint}</p>}
      <div className="flex flex-wrap justify-end gap-2">{children}</div>
    </div>
  );
}

/**
 * 带标签的筛选控件外壳。工具栏里的下拉往往省略 label，这里给出
 * 可见的短标签 + 关联 id，既不占空间也不牺牲可读性。
 */
export function InlineField({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: (props: { id: string }) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <label htmlFor={id} title={hint} className="whitespace-nowrap text-[11px] text-[var(--subtle)]">
        {label}
      </label>
      {children({ id })}
    </div>
  );
}
