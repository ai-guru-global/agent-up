import { NextRequest } from "next/server";
import { success, handleApiError } from "@/lib/utils";
import {
  chatCompletion,
  getLlmConfig,
  isLlmConfigured,
} from "@/lib/services/llm-service";

/**
 * GET /api/maas/probe — 返回 LLM 配置状态（不发真实请求）。
 * POST /api/maas/probe — 真实调用 MiMo 验证连通性，返回模型/时延/tokens。
 */
export async function GET() {
  const cfg = getLlmConfig();
  return success({
    configured: isLlmConfigured(),
    model: cfg.model,
    baseUrl: cfg.baseUrl,
  });
}

export async function POST(_request: NextRequest) {
  try {
    const result = await chatCompletion({
      messages: [
        {
          role: "system",
          content:
            "你是 agent-up 平台的连通性探针。请用一句简短的中文确认连接正常，并说明你的模型身份。",
        },
        { role: "user", content: "请确认连接状态。" },
      ],
      maxCompletionTokens: 1024,
    });
    return success({
      connected: true,
      model: result.model,
      reply: result.content,
      usage: result.usage,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
