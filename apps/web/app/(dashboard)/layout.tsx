import Link from "next/link";

const navItems = [
  { label: "工作台", href: "/" },
  { label: "Agent 管理", href: "/agents" },
  { label: "反馈中心", href: "/feedback" },
  { label: "发布审批", href: "/releases" },
  { label: "Skills 市场", href: "/skills" },
  { label: "知识库", href: "/wiki" },
  { label: "设置", href: "/settings" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center border-b border-slate-200 px-6">
          <Link href="/" className="text-lg font-semibold text-slate-900">
            Agent 改进平台
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <div className="text-sm text-slate-500">管理员</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
