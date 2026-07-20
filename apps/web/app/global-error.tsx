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
        <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
          <div className="w-full max-w-md rounded-lg bg-[var(--surface)] p-8 text-center ring-1 ring-[var(--border)]">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
              应用出错
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              {error.message || "发生了未知错误，请刷新页面重试"}
            </p>
            <button
              onClick={reset}
              className="mt-4 rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98]"
            >
              刷新页面
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
