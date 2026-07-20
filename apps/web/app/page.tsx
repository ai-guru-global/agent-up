import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[var(--background)]">
      <div className="max-w-md px-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
          Agent 改进平台
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          基于三层 Loop 设计的 Agent 持续改进管理平台
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/agents"
            className="rounded-md bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 active:scale-[0.98]"
          >
            进入工作台
          </Link>
          <Link
            href="/login"
            className="rounded-md px-5 py-2 text-sm font-medium text-zinc-500 ring-1 ring-[var(--border)] transition hover:text-[var(--foreground)] hover:ring-[var(--foreground)]/20 active:scale-[0.98]"
          >
            登录
          </Link>
        </div>
      </div>
    </main>
  );
}
