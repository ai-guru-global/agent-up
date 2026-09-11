import { NextRequest } from "next/server";
import { success, handleApiError } from "@/lib/utils";
import { getEvidenceChain } from "@/lib/services/evidence-chain-service";

/**
 * GET /api/agents/[id]/evidence-chain — 任务证据链（只读聚合，无新存储）。
 * 节点：反馈 → 试聊 trace → Release（AI 评测结论）→ Version（效果报告）→ 回滚审计；
 * 按时间倒序；响应固定携带诚实声明（非因果改进证明）。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return success(await getEvidenceChain(id));
  } catch (err) {
    return handleApiError(err);
  }
}
