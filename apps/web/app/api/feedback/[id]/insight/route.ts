import { NextRequest } from "next/server";
import { success, handleApiError } from "@/lib/utils";
import { NotFoundError } from "@/lib/errors";
import { getFeedback } from "@/lib/services/feedback-service";
import { chatCompletion } from "@/lib/services/llm-service";

/**
 * POST /api/feedback/[id]/insight — LLM 归因分析（无状态，不落库）。
 *
 * 读取反馈详情，调用 MiMo 生成「归因分析 + 改进建议」，
 * 服务 L2 环的「反馈 → 归因 → 改配置」叙事。
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const fb = await getFeedback(id);
    if (!fb) throw new NotFoundError("Feedback 不存在");

    const agentName =
      (fb.agent as { name?: string } | null)?.name ?? fb.agentId;

    const result = await chatCompletion({
      messages: [
        {
          role: "system",
          content:
            "你是 Agent 改进平台的资深运营分析师。用户对某个客服/工单 Agent 提交了一条反馈，" +
            "该 Agent 的配置分为四个分区：Prompt（提示词）/ Knowledge（知识库）/ Tools（工具）/ Routing（路由）。" +
            "请基于反馈内容输出两部分：\n" +
            "## 归因分析\n判断问题最可能出在哪个分区，说明理由。\n" +
            "## 改进建议\n给出 1-3 条可执行的配置改进动作。\n" +
            "要求：中文、简洁、直接给结论，不要复述反馈原文。",
        },
        {
          role: "user",
          content:
            `Agent：${agentName}\n` +
            `标题：${fb.title}\n` +
            `内容：${fb.content}\n` +
            `评价：${fb.rating} · 严重程度：${fb.severity}` +
            (fb.targetPartition ? ` · 用户指向分区：${fb.targetPartition}` : ""),
        },
      ],
    });

    return success({
      feedbackId: id,
      insight: result.content,
      model: result.model,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
