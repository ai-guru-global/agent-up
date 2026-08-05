"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("请填写用户名和密码");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (json.success) {
        router.push("/agents");
      } else {
        setError(json.error || "登录失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--background)]">
      <div className="w-full max-w-sm rounded-lg bg-[var(--surface)] p-8 ring-1 ring-[var(--border)]">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
          登录
        </h1>
        <p className="mt-1 text-sm text-zinc-400">Agent 改进平台</p>

        {/* MOCK 标注：认证未接入真实系统（NextAuth 预留位），此页为 mock 登录 */}
        <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
            MOCK 登录 · 未接入真实认证
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
            演示账号：allengaller / 123（硬编码于 api/auth/login，仅本地演示用）
          </p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-400">
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-[var(--accent)]"
              placeholder="allengaller"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400">
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md bg-[var(--background)] px-3 py-1.5 text-sm ring-1 ring-[var(--border)] placeholder:text-zinc-400 focus:outline-none focus:ring-[var(--accent)]"
              placeholder="•••"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? "登录中..." : "登录"}
          </button>
        </form>
      </div>
    </main>
  );
}
