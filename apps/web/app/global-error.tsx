"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4">
          <div className="w-full max-w-md rounded-lg bg-[var(--surface)] p-8 text-center ring-1 ring-[var(--border)]">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
              应用出错
            </h2>
            <p className="mt-2 break-words text-sm leading-relaxed text-[var(--muted)]">
              {error.message || "发生了未知错误，请刷新页面重试"}
            </p>
            {/* 这是整个应用壳层失败时的最后一道防线，需要把详情说清楚 */}
            <p className="mt-3 text-xs leading-relaxed text-[var(--subtle)]">
              错误发生在应用根层，当前页面无法继续渲染。本平台的数据存储与页面渲染相互独立，
              本次错误不会丢失已保存的配置或反馈记录。
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-[11px] text-[var(--subtle)]">
                错误编号 {error.digest}（反馈问题时请附上此编号）
              </p>
            )}
            <button
              type="button"
              onClick={reset}
              className="mt-4 rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98]"
            >
              刷新页面
            </button>
            <p className="mt-3 text-xs leading-relaxed text-[var(--subtle)]">
              若刷新后仍然报错，请确认本地开发服务（pnpm dev）仍在运行，并查看终端日志里的完整堆栈。
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
