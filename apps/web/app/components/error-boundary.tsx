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
        <div className="rounded-md bg-red-500/10 p-8 text-center">
          <p className="text-sm font-medium text-red-600">页面加载失败</p>
          <p className="mt-2 text-xs text-red-400">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 rounded-md bg-red-500/20 px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-500/30"
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
