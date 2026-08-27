"use client";

/**
 * 无障碍 Modal 与确认对话框。
 *
 * 建立此文件前：CreateAgentModal / CreateFeedbackModal / CreateSkillModal 等
 * 各自实现一遍遮罩层，都没有焦点陷阱、ESC 关闭、滚动锁定与 aria-modal；
 * agents/[id] 的版本回滚用的是原生 confirm()，releases 的「拒绝发布」
 * 甚至没有任何确认。这里统一收口。
 */

import { useCallback, useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { Alert, Button, cn } from "./primitives";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** 这个弹窗是干什么的、提交后会发生什么 */
  description?: ReactNode;
  /** 底部动作区 */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const SIZE = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" } as const;

export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  size = "md",
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  // 打开时记住触发元素，关闭后把焦点还回去
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus();
    return () => restoreRef.current?.focus?.();
  }, [open]);

  // 背景滚动锁定
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC 关闭 + Tab 焦点陷阱
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        // 只有点在遮罩本体上才关闭，避免拖选文本时误关
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          "w-full rounded-t-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl",
          "sm:rounded-xl",
          SIZE[size],
        )}
      >
        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <h2
              id={titleId}
              className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭弹窗"
              title="关闭弹窗（Esc）"
              className="-mr-1 -mt-1 inline-flex h-7 w-7 items-center justify-center rounded text-[var(--muted)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          {description && (
            <p id={descId} className="mt-1 text-xs leading-relaxed text-[var(--subtle)]">
              {description}
            </p>
          )}
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  /** 会发生什么、影响范围、能不能撤销 */
  description: ReactNode;
  /** 不可逆或高风险时额外强调 */
  warning?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  loadingLabel?: string;
}

/** 替代原生 confirm()：可解释、可键盘操作、样式与全站一致 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  warning,
  confirmLabel = "确认",
  cancelLabel = "取消",
  tone = "danger",
  loading = false,
  loadingLabel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
            loadingText={loadingLabel}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px] leading-relaxed text-[var(--foreground)]">
        <div>{description}</div>
        {warning && (
          <Alert tone="warn" title="请确认后再继续">
            {warning}
          </Alert>
        )}
      </div>
    </Modal>
  );
}
