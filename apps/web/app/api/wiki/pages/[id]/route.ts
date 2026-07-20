import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/utils";
import { getPage, updatePage, deletePage } from "@/lib/services/wiki-service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await getPage(id);
  if (!page) return error("Page 不存在", 404);
  return success(page);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody<Record<string, unknown>>(request);
  if (!body) return error("无效的请求体");
  try {
    const page = await updatePage(id, body);
    return success(page);
  } catch (err) {
    return error(err instanceof Error ? err.message : "更新失败", 500);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deletePage(id);
    return success({ message: "Page 已删除" });
  } catch (err) {
    return error(err instanceof Error ? err.message : "删除失败", 500);
  }
}
