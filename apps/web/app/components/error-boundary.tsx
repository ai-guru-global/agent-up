"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-6 py-10 text-center"
        >
          <p className="text-sm font-semibold text-[var(--danger)]">页面加载失败</p>
          <p className="mx-auto mt-2 max-w-lg break-words text-xs leading-relaxed text-[var(--danger)]">
            {this.state.error?.message}
          </p>
          {/* 告诉用户发生了什么、数据是否受影响、下一步怎么做 */}
          <p className="mx-auto mt-3 max-w-lg text-xs leading-relaxed text-[var(--muted)]">
            页面渲染时抛出了异常，已被隔离在当前区域，侧边导航仍可正常使用。
            本次异常不会修改任何数据。点「重试」会重新渲染本页；若反复出现，请刷新浏览器或把上方错误信息反馈给维护者。
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 inline-flex h-9 items-center rounded-md border border-[var(--danger-border)] px-3.5 text-[13px] font-medium text-[var(--danger)] transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] dark:hover:brightness-125"
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
