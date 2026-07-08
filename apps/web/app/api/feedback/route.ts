import { NextRequest } from "next/server";
import { success, error, parsePagination, paginationMeta, parseBody } from "@/lib/utils";
import { createFeedbackSchema, updateFeedbackSchema } from "@/lib/schemas";
import {
  listFeedback,
  createFeedback,
  updateFeedback,
} from "@/lib/services/feedback-service";

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
  const body = await parseBody(request);
  if (!body) return error("无效的请求体");

  const parsed = createFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return error("参数校验失败", 400, parsed.error.errors.map((e) => e.message));
  }

  try {
    const feedback = await createFeedback(parsed.data);
    return success(feedback, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "创建失败";
    return error(message, 500);
  }
}

/** PUT /api/feedback — 更新 Feedback */
export async function PUT(request: NextRequest) {
  const body = await parseBody(request);
  if (!body) return error("无效的请求体");

  const { id, ...rest } = body as { id?: string } & Record<string, unknown>;
  if (!id) return error("id 必填");

  const parsed = updateFeedbackSchema.safeParse(rest);
  if (!parsed.success) {
    return error("参数校验失败", 400, parsed.error.errors.map((e) => e.message));
  }

  try {
    const feedback = await updateFeedback(id, parsed.data);
    return success(feedback);
  } catch (err) {
    const message = err instanceof Error ? err.message : "更新失败";
    return error(message, 500);
  }
}
