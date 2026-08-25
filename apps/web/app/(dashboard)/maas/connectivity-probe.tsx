"use client";

/*
 * 真实连通性测试：POST /api/maas/probe 真实调用 MiMo（非 mock）。
 * 未配置 MIMO_API_KEY 时降级为提示文案。
 */
import { useState, useEffect } from "react";

interface ProbeStatus {
  configured: boolean;
  model: string;
  baseUrl: string;
}

interface ProbeResult {
  connected: boolean;
  model: string;
  reply: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
}

export function ConnectivityProbe() {
  const [status, setStatus] = useState<ProbeStatus | null>(null);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/maas/probe")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setStatus(json.data);
      })
      .catch(() => {});
  }, []);

  const runProbe = async () => {
    setTesting(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/maas/probe", { method: "POST" });
      const json = await res.json();
      if (json.success) setResult(json.data);
      else setError(json.error || "连通性测试失败");
    } catch {
      setError("网络错误");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-md bg-[var(--surface)] p-5 ring-1 ring-[var(--border)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-400">
            LIVE
          </span>
          <span className="text-sm font-medium text-[var(--foreground)]">
            真实连通性测试（非 mock，实时调用模型）
          </span>
          {status && (
            <span className="text-xs text-zinc-500">
              {status.model} · {status.baseUrl}
            </span>
          )}
        </div>
        <button
          onClick={runProbe}
          disabled={testing || status?.configured === false}
          className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          {testing ? "调用中…" : "发起真实调用"}
        </button>
      </div>

      {status?.configured === false && (
        <p className="mt-3 text-sm text-amber-400">
          未配置 MIMO_API_KEY：在仓库根目录 .env 中填入 MiMo Token Plan 凭据后重启即可启用。
        </p>
      )}

      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</div>
      )}

      {result && (
        <div className="mt-3 space-y-2">
          <p className="text-sm leading-relaxed text-zinc-300">
            <span className="mr-2 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-400">
              模型回复
            </span>
            {result.reply}
          </p>
          <p className="text-xs text-zinc-500 tabular-nums">
            模型 {result.model} · 时延 {result.latencyMs}ms · tokens{" "}
            {result.usage.promptTokens} 入 / {result.usage.completionTokens} 出（含推理 tokens）
          </p>
        </div>
      )}
    </div>
  );
}
