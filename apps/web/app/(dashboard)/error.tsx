"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Alert, Button } from "@/components/ui";

/**
 * Dashboard 段的路由级错误边界。ErrorBoundary 只能拦住渲染期异常，
 * Server Component 与数据读取抛错需要这一层接住。
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 把异常写进控制台，方便对照终端日志定位
    console.error("[dashboard] 页面渲染失败：", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl py-6">
      <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
        这个页面没能加载出来
      </h1>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
        侧边导航仍然可用，你可以先切换到其他页面，稍后再回来重试。
      </p>

      <Alert tone="danger" title="错误详情" className="mt-4">
        <span className="break-words">
          {error.message || "未捕获的异常，没有提供错误信息"}
        </span>
        {error.digest && (
          <span className="mt-1 block font-mono text-[11px] opacity-80">
            错误编号 {error.digest}
          </span>
        )}
      </Alert>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={reset}>
          重新加载本页
        </Button>
        <Link
          href="/dashboard/"
          className="inline-flex h-9 items-center rounded-md border border-[var(--border)] px-3.5 text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          回到工作台
        </Link>
      </div>

      <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-xs font-semibold text-[var(--foreground)]">常见原因与排查顺序</p>
        <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-[var(--muted)]">
          <li>
            1. 本地数据文件被改坏：检查 apps/web/data/ 下对应的 JSON 是否仍是合法格式，
            字段是否符合 lib/schemas.ts 的定义。
          </li>
          <li>
            2. 请求的记录不存在：例如直接输入了一个已删除的 Agent 详情地址，
            此时应回到列表页重新进入。
          </li>
          <li>
            3. 开发服务未就绪：确认终端里的 pnpm dev 仍在运行且没有编译错误。
          </li>
        </ol>
        <p className="mt-3 text-xs leading-relaxed text-[var(--subtle)]">
          本次错误不会修改任何已保存的数据，重试是安全的。
        </p>
      </div>
    </div>
  );
}
