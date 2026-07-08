import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/utils";
import { updateAgentSchema } from "@/lib/schemas";
import { getAgent, updateAgent, deleteAgent } from "@/lib/services/agent-service";

/** GET /api/agents/[id] — 获取 Agent 详情 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = await getAgent(id);
  if (!agent) return error("Agent 不存在", 404);
  return success(agent);
}

/** PUT /api/agents/[id] — 更新 Agent */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await parseBody(request);
  if (!body) return error("无效的请求体");

  const parsed = updateAgentSchema.safeParse(body);
  if (!parsed.success) {
    return error("参数校验失败", 400, parsed.error.errors.map((e) => e.message));
  }

  try {
    const agent = await updateAgent(id, parsed.data);
    return success(agent);
  } catch (err) {
    const message = err instanceof Error ? err.message : "更新失败";
    return error(message, err instanceof Error && err.message.includes("不存在") ? 404 : 500);
  }
}

/** DELETE /api/agents/[id] — 归档 Agent */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await deleteAgent(id);
    return success({ message: "Agent 已归档" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "操作失败";
    return error(message, 500);
  }
}
