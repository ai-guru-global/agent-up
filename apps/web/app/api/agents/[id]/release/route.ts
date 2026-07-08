import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/utils";
import { submitReleaseSchema, reviewReleaseSchema } from "@/lib/schemas";
import { submitRelease, reviewRelease } from "@/lib/services/release-service";

/** POST /api/agents/[id]/release — 提交发布 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await parseBody(request);
  if (!body) return error("无效的请求体");

  const parsed = submitReleaseSchema.safeParse(body);
  if (!parsed.success) {
    return error("参数校验失败", 400, parsed.error.errors.map((e) => e.message));
  }

  try {
    const release = await submitRelease(id, parsed.data.changeNote);
    return success(release, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "提交失败";
    return error(message, 500);
  }
}

/** PUT /api/agents/[id]/release — 审批发布 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const body = await parseBody(request);
  if (!body) return error("无效的请求体");

  const parsed = reviewReleaseSchema.safeParse(body);
  if (!parsed.success) {
    return error("参数校验失败", 400, parsed.error.errors.map((e) => e.message));
  }

  const { releaseId, action, reviewComment } = body as {
    releaseId: string;
    action: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
    reviewComment?: string;
  };

  if (!releaseId) return error("releaseId 必填");

  try {
    const release = await reviewRelease(releaseId, action, reviewComment);
    return success(release);
  } catch (err) {
    const message = err instanceof Error ? err.message : "审批失败";
    return error(message, 500);
  }
}
