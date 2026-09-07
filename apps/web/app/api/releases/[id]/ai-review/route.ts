import { NextRequest } from "next/server";
import { success, handleApiError } from "@/lib/utils";
import { runAiReview } from "@/lib/services/ai-review-service";

/**
 * POST /api/releases/[id]/ai-review — 对一条待审批 Release 运行发布前 AI 评测。
 *
 * 用 release 快照的 prompt 配置 replay 该 Agent 的全部评测用例（与
 * Playground 同一组装函数），LLM 判官逐条对照参考回复给出 PASS/FAIL，
 * 结果写回 release.aiReview 并在审批页展示。仅供审批人参考，不阻断审批。
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const release = await runAiReview(id);
    return success(release);
  } catch (err) {
    return handleApiError(err);
  }
}
