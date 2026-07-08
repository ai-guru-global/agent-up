import { NextRequest } from "next/server";
import { success, error, parsePagination, paginationMeta, parseBody } from "@/lib/utils";
import { listVaults, createVault } from "@/lib/services/wiki-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip, take } = parsePagination(searchParams);
  const agentId = searchParams.get("agentId") || undefined;
  const shared = searchParams.get("shared") === "true" ? true : undefined;

  const { items, total } = await listVaults({ skip, take, agentId, shared });
  return success({ items, pagination: paginationMeta(page, pageSize, total) });
}

export async function POST(request: NextRequest) {
  const body = await parseBody<{name: string; description?: string; agentId?: string; gitRepoUrl?: string; gitBranch?: string}>(request);
  if (!body?.name) return error("name 必填");
  try {
    const vault = await createVault(body);
    return success(vault, 201);
  } catch (err) {
    return error(err instanceof Error ? err.message : "创建失败", 500);
  }
}
