import Link from "next/link";

/**
 * 404 页。此前访问任何不存在的路径只会看到 Next.js 的默认英文页面，
 * 与全站中文界面完全脱节，也不给任何回到正轨的入口。
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--background)] p-4">
      <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--subtle)]">
          404 Not Found
        </p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-[var(--foreground)]">
          页面不存在
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
          你访问的地址没有对应的页面。可能是链接已失效、地址拼写有误，
          或该 Agent / 反馈 / 版本记录已经被删除。
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center rounded-md bg-[var(--accent)] px-3.5 text-[13px] font-medium text-white transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            回到工作台
          </Link>
          <Link
            href="/agents"
            className="inline-flex h-9 items-center rounded-md border border-[var(--border)] px-3.5 text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            查看 Agent 列表
          </Link>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-[var(--subtle)]">
          提示：本平台的有效路径包括 /dashboard、/agents、/feedback、/releases、/skills、/wiki、
          /maas、/settings 以及 /architecture 下的架构参考文档。
        </p>
      </div>
    </div>
  );
}
