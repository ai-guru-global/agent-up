import { NextRequest } from "next/server";
import { success, parsePagination, paginationMeta, validateBody, handleApiError } from "@/lib/utils";
import { createAgentSchema } from "@/lib/schemas";
import { listAgents, createAgent } from "@/lib/services/agent-service";
import { withActor, resolveActor } from "@/lib/context";

/** GET /api/agents — 获取 Agent 列表 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip, take } = parsePagination(searchParams);
  const status = searchParams.get("status") || undefined;
  const productGroupId = searchParams.get("productGroupId") || undefined;
  const search = searchParams.get("search") || undefined;

  const { items, total } = await listAgents({
    skip,
    take,
    status,
    productGroupId,
    search,
  });

  return success({
    items,
    pagination: paginationMeta(page, pageSize, total),
  });
}

/** POST /api/agents — 创建 Agent */
export async function POST(request: NextRequest) {
  const validated = await validateBody(request, createAgentSchema);
  if (!validated.ok) return validated.response;

  try {
    const agent = await withActor(resolveActor(request.headers), () =>
      createAgent(validated.data),
    );
    return success(agent, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
