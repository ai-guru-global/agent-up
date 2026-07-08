import { NextResponse } from "next/server";

/** 标准 API 成功响应 */
export function success<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

/** 标准 API 错误响应 */
export function error(message: string, status = 400, errors?: string[]) {
  return NextResponse.json({ success: false, error: message, errors }, { status });
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
