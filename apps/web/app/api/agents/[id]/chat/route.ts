import { NextRequest } from "next/server";
import { success, handleApiError, validateBody } from "@/lib/utils";
import { store } from "@/lib/data/store";
import { NotFoundError } from "@/lib/errors";
import { agentChatSchema } from "@/lib/schemas";
import { chatCompletion } from "@/lib/services/llm-service";

/**
 * POST /api/agents/[id]/chat — Agent 试聊 Playground（真实调用）。
 *
 * 加载该 Agent 当前的 Prompt 分区配置作为 system prompt，
 * 携带前端会话历史调用 MiMo。会话只存前端内存，不落库。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const agent = store.read<Record<string, unknown>>("agents", `${id}.json`);
    if (!agent) throw new NotFoundError("Agent 不存在");

    const validated = await validateBody(request, agentChatSchema);
    if (!validated.ok) return validated.response;
    const { message, history = [] } = validated.data;

    // 组装 system prompt：systemPrompt + 角色定义 + 约束 + 输出格式
    const pc = (agent.promptConfig ?? {}) as {
      systemPrompt?: string;
      roleDefinition?: string | null;
      constraints?: string[];
      outputFormat?: string | null;
    };
    const systemParts = [
      pc.systemPrompt ?? "",
      pc.roleDefinition ? `\n## 角色定义\n${pc.roleDefinition}` : "",
      pc.constraints?.length
        ? `\n## 约束条件\n${pc.constraints.map((c) => `- ${c}`).join("\n")}`
        : "",
      pc.outputFormat ? `\n## 输出格式\n${pc.outputFormat}` : "",
    ];

    const result = await chatCompletion({
      messages: [
        { role: "system", content: systemParts.join("") },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: message },
      ],
    });

    return success({
      reply: result.content,
      model: result.model,
      usage: result.usage,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
