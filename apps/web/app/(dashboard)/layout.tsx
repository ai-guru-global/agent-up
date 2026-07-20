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
        </nav>
        <div className="border-t border-[var(--border)] px-5 py-3">
          <div className="text-xs text-zinc-400">管理员</div>
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
