import { NextRequest } from "next/server";
import { success, parsePagination, paginationMeta, validateBody, handleApiError } from "@/lib/utils";
import { createWikiVaultSchema } from "@/lib/schemas";
import { listVaults, createVault } from "@/lib/services/wiki-service";
import { withActor, resolveActor } from "@/lib/context";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip, take } = parsePagination(searchParams);
  const agentId = searchParams.get("agentId") || undefined;
  const shared = searchParams.get("shared") === "true" ? true : undefined;

  const { items, total } = await listVaults({ skip, take, agentId, shared });
  return success({ items, pagination: paginationMeta(page, pageSize, total) });
}

export async function POST(request: NextRequest) {
  const validated = await validateBody(request, createWikiVaultSchema);
  if (!validated.ok) return validated.response;

  try {
    const vault = await withActor(resolveActor(request.headers), () =>
      createVault(validated.data),
    );
    return success(vault, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
