import { NextRequest } from "next/server";
import { success, handleApiError } from "@/lib/utils";
import { deleteEvalCase } from "@/lib/services/eval-case-service";
import { withActor, resolveActor } from "@/lib/context";

/**
 * DELETE /api/eval-cases/[id] — 从评测用例库移除一条用例。
 *
 * 删除即从 replay 语料中移除（发布 AI 评测不再覆盖它）。用例本身
 * 的来源 trace 不受影响，仍保留在 Trace 表供复盘。
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await withActor(resolveActor(request.headers), () => deleteEvalCase(id));
    return success({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
