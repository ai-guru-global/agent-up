import { NextRequest } from "next/server";
import { success, error, validateBody, handleApiError } from "@/lib/utils";
import { submitReleaseSchema, reviewReleaseSchema } from "@/lib/schemas";
import { submitRelease, reviewRelease } from "@/lib/services/release-service";
import { withActor, resolveActor } from "@/lib/context";

/** POST /api/agents/[id]/release — 提交发布 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const validated = await validateBody(request, submitReleaseSchema);
  if (!validated.ok) return validated.response;

  try {
    const release = await withActor(resolveActor(request.headers), () =>
      submitRelease(id, validated.data.changeNote),
    );
    return success(release, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * PUT /api/agents/[id]/release — 审批发布
 *
 * @deprecated 推荐使用 /api/releases/[id]/review，本端点为向后兼容保留。
 * 修复：此前用 `body as {...}` 绕过刚校验过的 parsed.data，且 path `id` 被丢弃；
 *      现在统一从 reviewReleaseSchema（含 releaseId）的 parsed.data 取值。
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params; // 向后兼容端点，path id 不参与（releaseId 在 body 中）
  const validated = await validateBody(request, reviewReleaseSchema);
  if (!validated.ok) return validated.response;

  try {
    const { releaseId, action, reviewComment } = validated.data;
    const release = await withActor(resolveActor(request.headers), () =>
      reviewRelease(releaseId, action, reviewComment),
    );
    return success(release);
  } catch (err) {
    return handleApiError(err);
  }
}
