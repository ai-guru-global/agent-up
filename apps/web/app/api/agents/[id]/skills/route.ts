import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/utils";
import { bindSkill, unbindSkill, getAgentSkillBindings } from "@/lib/services/skill-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const bindings = await getAgentSkillBindings(id);
  return success(bindings);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await parseBody<{ skillId: string; config?: Record<string, unknown> }>(request);
  if (!body?.skillId) return error("skillId 必填");
  try {
    const binding = await bindSkill(id, body.skillId, body.config);
    return success(binding, 201);
  } catch (err) {
    return error(err instanceof Error ? err.message : "绑定失败", 500);
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");
  const skillId = searchParams.get("skillId");
  if (!agentId || !skillId) return error("agentId 和 skillId 必填");
  try {
    await unbindSkill(agentId, skillId);
    return success({ message: "已解绑" });
  } catch (err) {
    return error(err instanceof Error ? err.message : "解绑失败", 500);
  }
}
