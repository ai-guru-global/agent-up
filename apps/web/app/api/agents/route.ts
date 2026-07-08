import { NextRequest } from "next/server";
import { success, error, parsePagination, paginationMeta, parseBody } from "@/lib/utils";
import { createAgentSchema } from "@/lib/schemas";
import { listAgents, createAgent } from "@/lib/services/agent-service";

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
  const body = await parseBody(request);
  if (!body) return error("无效的请求体");

  const parsed = createAgentSchema.safeParse(body);
  if (!parsed.success) {
    return error("参数校验失败", 400, parsed.error.errors.map((e) => e.message));
  }

  try {
    const agent = await createAgent(parsed.data);
    return success(agent, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "创建失败";
    return error(message, 500);
  }
}
