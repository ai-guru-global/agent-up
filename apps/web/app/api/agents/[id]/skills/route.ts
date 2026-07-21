import { NextRequest } from "next/server";
import { success, error, validateBody, handleApiError } from "@/lib/utils";
import { bindSkillSchema } from "@/lib/schemas";
import { bindSkill, unbindSkill, getAgentSkillBindings } from "@/lib/services/skill-service";
import { withActor, resolveActor } from "@/lib/context";

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
  const validated = await validateBody(request, bindSkillSchema);
  if (!validated.ok) return validated.response;

  try {
    const binding = await withActor(resolveActor(request.headers), () =>
      bindSkill(id, validated.data.skillId, validated.data.config),
    );
    return success(binding, 201);
  } catch (err) {
    return handleApiError(err);
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
    return handleApiError(err);
  }
}
