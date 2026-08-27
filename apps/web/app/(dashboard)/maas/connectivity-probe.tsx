"use client";

/*
 * 真实连通性测试：POST /api/maas/probe 真实调用 MiMo（非 mock）。
 * 未配置 MIMO_API_KEY 时降级为提示文案。
 */
import { useState, useEffect } from "react";
import { Alert, Badge, Button, Hint } from "@/components/ui";

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
  // 状态行只是辅助信息（当前模型与端点），拉取失败不阻断主操作 —— 下方的真实调用有自己完整的错误态。
  // 但不能完全静默：这一块无声消失，看起来就像页面本来就没这段，用户无从判断少看了什么
  const [statusFailed, setStatusFailed] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/maas/probe")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setStatus(json.data);
        else setStatusFailed(true);
      })
      .catch(() => setStatusFailed(true));
  }, []);

  return (
    <section
      aria-labelledby="probe-heading"
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success" title="本区块是真实的模型调用，与本页其余 mock 数据不同">
              LIVE
            </Badge>
            <span id="probe-heading" className="text-sm font-medium text-[var(--foreground)]">
              真实连通性测试（非 mock，实时调用模型）
            </span>
          </div>
          {status ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              <span title="当前生效的模型标识，由环境变量决定">{status.model}</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span title="推理请求实际发往的服务端点">{status.baseUrl}</span>
            </p>
          ) : statusFailed ? (
            <p className="mt-1 text-xs leading-relaxed text-[var(--subtle)]">
              这次没能读到当前生效的模型与端点信息；不影响发起调用测试，成功的回复下方会注明所用模型。
            </p>
          ) : null}
        </div>
        <Button
          variant="primary"
          onClick={async () => {
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
          }}
          disabled={status?.configured === false}
          loading={testing}
          loadingText="调用中…"
          title={
            status?.configured === false
              ? "未配置 API Key，无法发起调用"
              : "向模型发送一条固定的探测消息，验证凭据、网络与端点是否可用"
          }
        >
          发起真实调用
        </Button>
      </div>

      <Hint className="mt-2 max-w-3xl">
        点击按钮会向模型发一条极短的固定探测消息，用来确认凭据有效、网络可达、端点正确。
        它只验证「能不能调通」，不代表任何业务效果；单次消耗通常在几十 token 以内，可以放心重复点击。
        本页其余的产品矩阵与用量数据均为 mock，只有这一块是真实调用。
      </Hint>

      {status?.configured === false && (
        <Alert tone="warn" title="尚未配置模型凭据" className="mt-3">
          未配置 MIMO_API_KEY：在仓库根目录 .env 中填入 MiMo Token Plan 凭据后重启即可启用。
          <span className="mt-1 block text-xs">
            未配置时按钮保持禁用，页面其余内容仍可正常浏览；Agent 详情页的试聊 Playground 同样依赖这份凭据。
          </span>
        </Alert>
      )}

      {error && (
        <Alert tone="danger" title="连通性测试未通过" className="mt-3">
          {error}
          <span className="mt-1 block text-xs">
            常见原因：凭据过期、出网被拦、端点地址写错。可以先确认 .env 里的 Key 与 baseUrl，再重试一次。
          </span>
        </Alert>
      )}

      {result && (
        <div className="mt-3 space-y-2" role="status" aria-live="polite">
          <p className="text-sm leading-relaxed text-[var(--foreground)]">
            <Badge tone="success" className="mr-2" title="模型针对探测消息给出的原始回复">
              模型回复
            </Badge>
            {result.reply}
          </p>
          <p className="text-xs tabular-nums text-[var(--subtle)]">
            模型 {result.model} · 时延 {result.latencyMs}ms · tokens{" "}
            {result.usage.promptTokens} 入 / {result.usage.completionTokens} 出（含推理 tokens）
          </p>
          <Hint>
            时延是端到端往返耗时，包含网络与排队时间；入/出 token 分别对应请求与回复的计费量。
            拿到回复即说明这条链路已完全打通，可以去 Agent 详情页做真实试聊了。
          </Hint>
        </div>
      )}
    </section>
  );
}
