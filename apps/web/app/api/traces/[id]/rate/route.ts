import { NextRequest } from "next/server";
import { success, handleApiError, validateBody } from "@/lib/utils";
import { rateTraceSchema } from "@/lib/schemas";
import { rateTrace } from "@/lib/services/trace-service";
import { recordAudit } from "@/lib/services/audit-service";

/**
 * POST /api/traces/[id]/rate — 给一条试聊 trace 打分（👍 UP / 👎 DOWN）。
 *
 * 打分是 Playground 内联的轻量反馈：写入 trace 本身，同时记审计。
 * 被打分（尤其 DOWN）的 trace 是「沉淀为评测用例」的首选素材。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const validated = await validateBody(request, rateTraceSchema);
    if (!validated.ok) return validated.response;
    const { rating, note } = validated.data;

    const trace = rateTrace(id, rating, note);
    recordAudit("trace.rate", "trace", id, {
      agentId: trace.agentId,
      rating,
    });

    return success({
      id: trace.id,
      agentId: trace.agentId,
      rating: trace.rating,
      ratedAt: trace.ratedAt,
      note: trace.note,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
