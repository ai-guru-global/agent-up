/**
 * LLM 网关：接入小米 MiMo（OpenAI 兼容协议）。
 *
 * 凭据走 env（MIMO_API_KEY / MIMO_BASE_URL / MIMO_MODEL），代码零硬编码；
 * 原生 fetch 直连，不引 SDK；统一超时与结构化错误（AppError 体系）。
 * 注意：MiMo 为推理模型，reasoning_content 会消耗 completion tokens，
 * max_completion_tokens 需给足余量，否则 content 可能为空。
 */
import { AppError } from "@/lib/errors";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmResult {
  content: string;
  model: string;
  usage: LlmUsage;
  latencyMs: number;
}

/** 503 —— 未配置凭据 */
export class LlmNotConfiguredError extends AppError {
  constructor() {
    super("LLM 未配置：请在 env 中设置 MIMO_API_KEY", 503, "INTERNAL");
  }
}

/** 502 —— 上游错误（鉴权失败 / 限流 / 服务异常 / 空响应） */
export class LlmUpstreamError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 502, "INTERNAL", details);
  }
}

/** 504 —— 调用超时 */
export class LlmTimeoutError extends AppError {
  constructor() {
    super("LLM 调用超时", 504, "INTERNAL");
  }
}

const DEFAULT_BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1";
const DEFAULT_MODEL = "mimo-v2.5-pro";
const DEFAULT_TIMEOUT_MS = 120_000; // 推理模型响应偏慢，给足时间
const DEFAULT_MAX_COMPLETION_TOKENS = 2048;

export function getLlmConfig() {
  return {
    apiKey: process.env.MIMO_API_KEY ?? "",
    baseUrl: (process.env.MIMO_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: process.env.MIMO_MODEL || DEFAULT_MODEL,
  };
}

export function isLlmConfigured() {
  return Boolean(process.env.MIMO_API_KEY);
}

export async function chatCompletion(opts: {
  messages: LlmMessage[];
  model?: string;
  maxCompletionTokens?: number;
  timeoutMs?: number;
  /** 请求 OpenAI 兼容的 JSON 结构化输出（发布评测等场景）；system 提示中需同时说明 */
  responseFormat?: "json_object";
}): Promise<LlmResult> {
  const cfg = getLlmConfig();
  if (!cfg.apiKey) throw new LlmNotConfiguredError();

  const startedAt = Date.now();
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "api-key": cfg.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model ?? cfg.model,
        messages: opts.messages,
        max_completion_tokens:
          opts.maxCompletionTokens ?? DEFAULT_MAX_COMPLETION_TOKENS,
        ...(opts.responseFormat
          ? { response_format: { type: opts.responseFormat } }
          : {}),
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new LlmTimeoutError();
    }
    throw new LlmUpstreamError("无法连接 LLM 服务", {
      cause: err instanceof Error ? err.message : String(err),
    });
  }

  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 300);
    throw new LlmUpstreamError(`LLM 上游错误（HTTP ${res.status}）`, {
      status: res.status,
      body: text,
    });
  }

  const json = (await res.json().catch(() => null)) as {
    model?: string;
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  } | null;

  const content = json?.choices?.[0]?.message?.content ?? "";
  if (!json || !content) {
    throw new LlmUpstreamError(
      "模型返回空内容（可能是推理 tokens 超出 max_completion_tokens）",
    );
  }

  return {
    content,
    model: json.model ?? (opts.model ?? cfg.model),
    usage: {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      totalTokens: json.usage?.total_tokens ?? 0,
    },
    latencyMs: Date.now() - startedAt,
  };
}
