import { NextRequest } from "next/server";
import { success, validateBody, handleApiError } from "@/lib/utils";
import { reviewReleaseSchema } from "@/lib/schemas";
import { reviewRelease } from "@/lib/services/release-service";
import { withActor, resolveActor } from "@/lib/context";

/**
 * PUT /api/releases/[id]/review — 审批 Release
 * path 的 id 即 releaseId（权威）；body 里若也带 releaseId 仅作兼容，被 path 覆盖。
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const validated = await validateBody(request, reviewReleaseSchema);
  if (!validated.ok) return validated.response;

  try {
    const { action, reviewComment } = validated.data;
    const release = await withActor(resolveActor(request.headers), () =>
      reviewRelease(id, action, reviewComment),
    );
    return success(release);
  } catch (err) {
    return handleApiError(err);
  }
}
