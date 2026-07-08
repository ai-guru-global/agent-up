import { NextRequest } from "next/server";
import { success, error, parsePagination, paginationMeta, parseBody } from "@/lib/utils";
import { listPages, createPage } from "@/lib/services/wiki-service";

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
  const body = await parseBody<{title: string; slug: string; content: string; summary?: string; provenance?: string; tier?: string; tags?: string[]; categories?: string[]}>(request);
  if (!body?.title || !body?.slug || !body?.content) return error("title/slug/content 必填");
  try {
    const page = await createPage({ vaultId: id, ...body });
    return success(page, 201);
  } catch (err) {
    return error(err instanceof Error ? err.message : "创建失败", 500);
  }
}
