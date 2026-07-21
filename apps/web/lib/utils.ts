import { NextResponse } from "next/server";
import type { ZodSchema, infer as zinfer } from "zod";
import { toErrorBody } from "@/lib/errors";

/** 标准 API 成功响应 */
export function success<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

/** 标准 API 错误响应（保留向后兼容的旧签名） */
export function error(message: string, status = 400, errors?: string[]) {
  return NextResponse.json(
    { success: false, error: message, ...(errors ? { errors } : {}) },
    { status },
  );
}

/**
 * 统一错误处理。把任意 thrown 值映射成正确的 HTTP 响应。
 * service 层抛 AppError 子类即可获得精确 status / code。
 */
export function handleApiError(err: unknown) {
  const { status, body } = toErrorBody(err);
  return NextResponse.json(body, { status });
}

/** 分页参数解析 */
export function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10))
  );
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip, take: pageSize };
}

/** 分页响应元数据 */
export function paginationMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    hasMore: page * pageSize < total,
  };
}

/** 安全解析 JSON body */
export async function parseBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/**
 * 用 Zod schema 校验请求体。
 * 成功返回 { ok: true, data }；失败直接返回 422 响应。
 * 消除每个 route 里重复的 safeParse + map errors 样板。
 */
export async function validateBody<S extends ZodSchema>(
  request: Request,
  schema: S,
): Promise<
  { ok: true; data: zinfer<S> } | { ok: false; response: NextResponse }
> {
  const body = await parseBody<unknown>(request);
  if (body === null) {
    return { ok: false, response: error("无效的请求体", 400) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: error(
        "参数校验失败",
        422,
        parsed.error.errors.map((e) => e.message),
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
