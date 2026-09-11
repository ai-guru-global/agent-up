import { NextRequest } from "next/server";
import { success, error, parseBody, handleApiError } from "@/lib/utils";
import { feedbackIngestSchema } from "@/lib/schemas";
import { ingestFeedback } from "@/lib/services/feedback-service";
import { withActor, resolveActor } from "@/lib/context";

/**
 * POST /api/feedback/ingest — 多渠道工单适配器（机器接入，R5b）。
 *
 * 与 POST /api/feedback（人：web 表单 / Chrome 插件）不同，本端点面向工单系统
 * 原生日志接入：body.channel 选择适配器规范化外部 payload，记来源渠道与外部单号，
 * 同渠道同单号重复接入返回 409（幂等，防 webhook 重试）。
 * 机器调用方可带 x-actor-id 头标识来源系统，缺省 system。
 */
export async function POST(request: NextRequest) {
  const raw = await parseBody<unknown>(request);
  if (raw === null) return error("无效的请求体");

  const parsed = feedbackIngestSchema.safeParse(raw);
  if (!parsed.success) {
    return error("参数校验失败", 422, parsed.error.errors.map((e) => e.message));
  }

  try {
    const feedback = await withActor(resolveActor(request.headers), () =>
      ingestFeedback(parsed.data),
    );
    return success(feedback, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
