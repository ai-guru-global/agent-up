"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ErrorBoundary } from "../components/error-boundary";

const navItems = [
  { label: "工作台", href: "/" },
  { label: "Agent", href: "/agents" },
  { label: "反馈", href: "/feedback" },
  { label: "发布", href: "/releases" },
  { label: "Skills", href: "/skills" },
  { label: "知识库", href: "/wiki" },
  { label: "设置", href: "/settings" },
];

const archItems = [
  { label: "架构总览", href: "/architecture" },
  { label: "Loop 工程", href: "/architecture/loop" },
  { label: "Harness 工程", href: "/architecture/harness" },
  { label: "改进路线图", href: "/architecture/roadmap" },
];

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[100dvh] bg-[var(--background)]">
      <aside className="flex w-56 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
        <div className="flex h-14 items-center border-b border-[var(--border)] px-5">
          <Link href="/" className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
            AgentUp
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-3">
          {navItems.map((item) => {
            const active = isActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                  active
                    ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                    : "text-zinc-500 hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="px-3 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            架构参考
          </div>
          {archItems.map((item) => {
            const active = isActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                  active
                    ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                    : "text-zinc-500 hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-[var(--border)] px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-zinc-400">管理员</div>
            {/* MOCK 标注：当前无真实身份体系，角色固定为 mock 管理员 */}
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-600 dark:text-amber-400">
              MOCK
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
            数据源：apps/web/data/ 本地 JSON 种子数据（mock），未接入真实数据库
          </p>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
