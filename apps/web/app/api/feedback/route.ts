import { NextRequest } from "next/server";
import { success, error, parsePagination, paginationMeta, parseBody, handleApiError } from "@/lib/utils";
import { createFeedbackSchema, updateFeedbackSchema } from "@/lib/schemas";
import {
  listFeedback,
  createFeedback,
  updateFeedback,
} from "@/lib/services/feedback-service";
import { withActor, resolveActor } from "@/lib/context";

/** GET /api/feedback — 获取 Feedback 列表 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip, take } = parsePagination(searchParams);
  const agentId = searchParams.get("agentId") || undefined;
  const status = searchParams.get("status") || undefined;
  const severity = searchParams.get("severity") || undefined;
  const rating = searchParams.get("rating") || undefined;
  const tag = searchParams.get("tag") || undefined;

  const { items, total } = await listFeedback({
    skip, take, agentId, status, severity, rating, tag,
  });

  return success({
    items,
    pagination: paginationMeta(page, pageSize, total),
  });
}

/** POST /api/feedback — 创建 Feedback */
export async function POST(request: NextRequest) {
  const raw = await parseBody<unknown>(request);
  if (raw === null) return error("无效的请求体");

  // createFeedbackSchema 不含 id；直接校验
  const parsed = createFeedbackSchema.safeParse(raw);
  if (!parsed.success) {
    return error("参数校验失败", 422, parsed.error.errors.map((e) => e.message));
  }

  try {
    const feedback = await withActor(resolveActor(request.headers), () =>
      createFeedback(parsed.data),
    );
    return success(feedback, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

/** PUT /api/feedback — 更新 Feedback（body 需带 id） */
export async function PUT(request: NextRequest) {
  const raw = await parseBody<{ id?: string } & Record<string, unknown>>(request);
  if (raw === null) return error("无效的请求体");

  const { id, ...rest } = raw;
  if (!id) return error("id 必填");

  const parsed = updateFeedbackSchema.safeParse(rest);
  if (!parsed.success) {
    return error("参数校验失败", 422, parsed.error.errors.map((e) => e.message));
  }

  try {
    const feedback = await withActor(resolveActor(request.headers), () =>
      updateFeedback(id, parsed.data),
    );
    return success(feedback);
  } catch (err) {
    return handleApiError(err);
  }
}
