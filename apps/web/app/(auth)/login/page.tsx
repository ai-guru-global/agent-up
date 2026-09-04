"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Button, Field, Input } from "@/components/ui";

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
        router.push("/dashboard");
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
    <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--background)] px-4 py-12">
      <div className="w-full max-w-sm rounded-lg bg-[var(--surface)] p-8 ring-1 ring-[var(--border)]">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
          登录
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Agent 改进平台</p>

        {/* MOCK 标注：认证未接入真实系统（NextAuth 预留位），此页为 mock 登录 */}
        <div className="mt-4 rounded-md border border-[var(--warn-border)] bg-[var(--warn-bg)] px-3 py-2">
          <p className="text-xs font-semibold text-[var(--warn)]">
            MOCK 登录 · 未接入真实认证
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted)]">
            演示账号：allengaller / 123（硬编码于 api/auth/login，仅本地演示用）
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--subtle)]">
            登录成功后不会写入任何会话凭证，页面只是跳转到工作台；直接访问 /dashboard
            也能进入，本页仅用于走通认证流程的形态。
          </p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          {error && (
            <Alert tone="danger" title="登录未通过">
              {error}
            </Alert>
          )}

          <Field label="用户名" required hint="演示环境请填 allengaller">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="allengaller"
              />
            )}
          </Field>

          <Field label="密码" required hint="演示环境请填 123">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••"
              />
            )}
          </Field>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={submitting}
            loadingText="登录中..."
          >
            登录
          </Button>
        </form>

        <p className="mt-4 text-[11px] leading-relaxed text-[var(--subtle)]">
          不想登录也可以{" "}
          <Link
            href="/dashboard/"
            className="rounded text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            直接进入工作台
          </Link>
          ，或返回{" "}
          <Link
            href="/"
            className="rounded text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            平台介绍页
          </Link>
          。
        </p>
      </div>
    </main>
  );
}
