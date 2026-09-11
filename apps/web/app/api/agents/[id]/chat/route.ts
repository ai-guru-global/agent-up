import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, handleApiError, validateBody } from "@/lib/utils";
import { NotFoundError } from "@/lib/errors";
import { agentChatSchema } from "@/lib/schemas";
import { chatCompletion } from "@/lib/services/llm-service";
import { buildSystemPrompt } from "@/lib/services/prompt-builder";
import { recordTrace } from "@/lib/services/trace-service";

/**
 * POST /api/agents/[id]/chat — Agent 试聊 Playground（真实调用）。
 *
 * 加载该 Agent 当前的 Prompt 分区配置作为 system prompt（与发布 AI 评测的
 * replay 共用 buildSystemPrompt，保证「评测时的行为 == 试聊时的行为」），
 * 携带前端会话历史调用 MiMo。成功后把整轮上下文落盘为一条 trace，
 * 响应带 traceId 供前端打分（👍/👎）或沉淀为评测用例。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const agent = await prisma.agent.findUnique({
      where: { id },
      include: { promptConfig: true },
    });
    if (!agent) throw new NotFoundError("Agent 不存在");

    const validated = await validateBody(request, agentChatSchema);
    if (!validated.ok) return validated.response;
    const { message, history = [] } = validated.data;

    const systemPrompt = buildSystemPrompt(
      agent.promptConfig
        ? {
            systemPrompt: agent.promptConfig.systemPrompt,
            roleDefinition: agent.promptConfig.roleDefinition,
            constraints: agent.promptConfig.constraints,
            outputFormat: agent.promptConfig.outputFormat,
          }
        : null,
    );

    const result = await chatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: message },
      ],
    });

    // 成功回复后落盘为 trace；落盘失败不打断主流程（recordTrace 内部已兜底）
    const trace = recordTrace({
      agentId: id,
      systemPrompt,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      message,
      reply: result.content,
      model: result.model,
      usage: result.usage,
      latencyMs: result.latencyMs,
    });

    return success({
      reply: result.content,
      model: result.model,
      usage: result.usage,
      latencyMs: result.latencyMs,
      traceId: trace?.id ?? null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
