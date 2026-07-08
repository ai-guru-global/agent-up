import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/utils";
import { reviewReleaseSchema } from "@/lib/schemas";
import { reviewRelease } from "@/lib/services/release-service";

/** PUT /api/releases/[id]/review — 审批 Release */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await parseBody(request);
  if (!body) return error("无效的请求体");

  const parsed = reviewReleaseSchema.safeParse(body);
  if (!parsed.success) {
    return error("参数校验失败", 400, parsed.error.errors.map((e) => e.message));
  }

  try {
    const release = await reviewRelease(id, parsed.data.action, parsed.data.reviewComment);
    return success(release);
  } catch (err) {
    const message = err instanceof Error ? err.message : "审批失败";
    return error(message, 500);
  }
}
