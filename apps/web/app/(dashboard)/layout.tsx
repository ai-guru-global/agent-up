"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "../components/error-boundary";
import { MockTag } from "@/components/ui";

/**
 * 导航项补了 desc：侧边栏只有两三个字的标签，新用户无法判断
 * 「反馈」和「发布」的区别。desc 通过 title 提供悬浮解释，
 * 并在移动端抽屉里直接显示为副标题。
 */
const navItems = [
  { label: "工作台", href: "/dashboard/", desc: "全局概览：待办、趋势与最近动态" },
  { label: "Agent", href: "/agents/", desc: "管理 Agent 的四分区配置与版本" },
  { label: "反馈", href: "/feedback/", desc: "收集问题、归因到分区并跟踪处理" },
  { label: "发布", href: "/releases/", desc: "审批配置变更并生成版本快照" },
  { label: "Skills", href: "/skills/", desc: "可复用的技能组件，供 Agent 绑定" },
  { label: "知识库", href: "/wiki/", desc: "Agent 的长期记忆，检索的语料来源" },
  { label: "模型服务", href: "/maas/", desc: "模型接入与连通性探测（MaaS）" },
  { label: "设置", href: "/settings/", desc: "产品组、角色权限与审计日志" },
];

const archItems = [
  { label: "架构总览", href: "/architecture/", desc: "平台设计思路与四分区模型" },
  { label: "Loop 工程", href: "/architecture/loop/", desc: "三层改进闭环的运转方式" },
  { label: "Harness 工程", href: "/architecture/harness/", desc: "Agent 外壳与上下文工程" },
  { label: "改进路线图", href: "/architecture/roadmap/", desc: "已完成与规划中的能力" },
];

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  // /architecture 与 /architecture/loop 等存在前缀包含关系，
  // 总览页只在精确匹配时高亮，否则会同时亮两项
  if (href === "/architecture") return pathname === "/architecture";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  onNavigate,
  showDesc,
}: {
  item: { label: string; href: string; desc: string };
  active: boolean;
  onNavigate: () => void;
  showDesc: boolean;
}) {
  return (
    <Link
      href={item.href}
      title={item.desc}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`block rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${
        active
          ? "bg-[var(--accent-muted)] text-[var(--accent)]"
          : "text-[var(--muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)]"
      }`}
    >
      <span className="flex items-center gap-1.5">
        {/* 活跃态除了配色，再加一条左侧标记，不单靠颜色传达状态 */}
        <span
          aria-hidden="true"
          className={`h-3.5 w-0.5 shrink-0 rounded-full ${active ? "bg-[var(--accent)]" : "bg-transparent"}`}
        />
        {item.label}
      </span>
      {showDesc && (
        <span className="mt-0.5 block pl-3 text-[11px] font-normal leading-snug text-[var(--subtle)]">
          {item.desc}
        </span>
      )}
    </Link>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = () => setDrawerOpen(false);

  // 路由变化后抽屉自动收起：由每个 NavLink 的 onNavigate 直接调用 closeDrawer 完成。
  // 抽屉打开时是全屏遮罩，一切跳转都必经这些链接，因此无需再用 effect 监听 pathname
  // （在 effect 里同步 setState 会触发级联渲染）。

  // 抽屉打开时锁定背景滚动，并支持 Esc 关闭
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  const sidebarContent = (showDesc: boolean) => (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-5">
        <Link
          href="/dashboard/"
          onClick={closeDrawer}
          title="AgentUp · Agent 持续改进平台，回到工作台"
          className="text-[15px] font-semibold tracking-tight text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          AgentUp
        </Link>
        <button
          type="button"
          onClick={closeDrawer}
          aria-label="收起导航菜单"
          title="收起导航菜单（Esc）"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] lg:hidden"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <nav aria-label="主导航" className="flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item.href, pathname)}
              onNavigate={closeDrawer}
              showDesc={showDesc}
            />
          ))}
        </div>
        <div
          id="nav-arch-heading"
          className="px-3 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-wider text-[var(--subtle)]"
        >
          架构参考
        </div>
        {/* 架构参考是只读的说明性文档，与上面的操作型页面区分开 */}
        <p className="px-3 pb-2 text-[10px] leading-relaxed text-[var(--subtle)]">
          只读文档：解释平台为什么这样设计，不涉及任何数据修改
        </p>
        <div className="space-y-0.5" aria-labelledby="nav-arch-heading" role="group">
          {archItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item.href, pathname)}
              onNavigate={closeDrawer}
              showDesc={showDesc}
            />
          ))}
        </div>
      </nav>

      <div className="shrink-0 border-t border-[var(--border)] px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-[var(--muted)]">管理员</div>
          {/* MOCK 标注：当前无真实身份体系，角色固定为 mock 管理员 */}
          <MockTag note="当前无真实身份体系，登录后角色固定为 mock 管理员，拥有全部权限" />
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-[var(--subtle)]">
          数据源：本地 PostgreSQL（Prisma）中的种子数据
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-[var(--subtle)]">
          所有增删改都会写入数据库，重启服务后仍然保留；演示环境可随时修改，不影响任何线上系统
        </p>
      </div>
    </>
  );

  return (
    <div className="flex min-h-[100dvh] bg-[var(--background)]">
      {/* 键盘用户可以跳过整段导航直达内容 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-[var(--accent)] focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-white"
      >
        跳到主要内容
      </a>

      {/* 桌面端常驻侧边栏 */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] lg:sticky lg:top-0 lg:flex lg:h-[100dvh]">
        {sidebarContent(false)}
      </aside>

      {/* 移动端抽屉 */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="导航菜单"
            className="absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col border-r border-[var(--border)] bg-[var(--surface)] shadow-xl"
          >
            {sidebarContent(true)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 移动端顶栏：桌面端侧边栏隐藏后，这里是唯一的导航入口 */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/95 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="展开导航菜单"
            aria-expanded={drawerOpen}
            title="展开导航菜单"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--foreground)] transition-colors hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            <span aria-hidden="true" className="text-base leading-none">
              ☰
            </span>
          </button>
          <Link
            href="/dashboard/"
            className="text-[15px] font-semibold tracking-tight text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            AgentUp
          </Link>
          <MockTag note="演示环境：数据来自本地 PostgreSQL 的种子数据" />
        </header>

        <main id="main-content" tabIndex={-1} className="flex-1 overflow-x-hidden">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
