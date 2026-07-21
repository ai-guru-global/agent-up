import { NextRequest } from "next/server";
import { success, error, validateBody, handleApiError } from "@/lib/utils";
import { updateWikiPageSchema } from "@/lib/schemas";
import { getPage, updatePage, deletePage } from "@/lib/services/wiki-service";
import { withActor, resolveActor } from "@/lib/context";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await getPage(id);
  if (!page) return error("Page 不存在", 404);
  return success(page);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const validated = await validateBody(request, updateWikiPageSchema);
  if (!validated.ok) return validated.response;

  try {
    const page = await withActor(resolveActor(request.headers), () =>
      updatePage(id, validated.data),
    );
    return success(page);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await withActor(resolveActor(request.headers), () => deletePage(id));
    return success({ message: "Page 已删除" });
  } catch (err) {
    return handleApiError(err);
  }
}
