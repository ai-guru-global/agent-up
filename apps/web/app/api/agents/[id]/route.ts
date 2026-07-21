import { NextRequest } from "next/server";
import { success, error, validateBody, handleApiError } from "@/lib/utils";
import { updateAgentSchema } from "@/lib/schemas";
import { getAgent, updateAgent, deleteAgent } from "@/lib/services/agent-service";
import { withActor, resolveActor } from "@/lib/context";

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
  const validated = await validateBody(request, updateAgentSchema);
  if (!validated.ok) return validated.response;

  try {
    const agent = await withActor(resolveActor(request.headers), () =>
      updateAgent(id, validated.data),
    );
    return success(agent);
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE /api/agents/[id] — 归档 Agent */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await withActor(resolveActor(request.headers), () => deleteAgent(id));
    return success({ message: "Agent 已归档" });
  } catch (err) {
    return handleApiError(err);
  }
}
