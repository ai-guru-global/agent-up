import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="container mx-auto max-w-2xl px-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Agent 改进平台
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          基于三层 Loop 设计理念的 Agent 持续改进管理平台
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/agents"
            className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-medium text-white hover:bg-slate-800"
          >
            进入工作台
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-slate-300 px-6 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            登录
          </Link>
        </div>
      </div>
    </main>
  );
}
