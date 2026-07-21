import { NextRequest } from "next/server";
import { success, parsePagination, paginationMeta, validateBody, handleApiError } from "@/lib/utils";
import { createWikiPageSchema } from "@/lib/schemas";
import { listPages, createPage } from "@/lib/services/wiki-service";
import { withActor, resolveActor } from "@/lib/context";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip, take } = parsePagination(searchParams);
  const lifecycle = searchParams.get("lifecycle") || undefined;
  const tier = searchParams.get("tier") || undefined;
  const search = searchParams.get("search") || undefined;

  const { items, total } = await listPages({ vaultId: id, skip, take, lifecycle, tier, search });
  return success({ items, pagination: paginationMeta(page, pageSize, total) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const validated = await validateBody(request, createWikiPageSchema);
  if (!validated.ok) return validated.response;

  try {
    const page = await withActor(resolveActor(request.headers), () =>
      // path 的 id 为权威 vaultId，覆盖 body 中可能存在的 vaultId
      createPage({ ...validated.data, vaultId: id }),
    );
    return success(page, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
