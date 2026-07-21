import { NextRequest } from "next/server";
import { success, error, validateBody, handleApiError } from "@/lib/utils";
import { updateSkillSchema } from "@/lib/schemas";
import { getSkill, updateSkill, deleteSkill } from "@/lib/services/skill-service";
import { withActor, resolveActor } from "@/lib/context";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const skill = await getSkill(id);
  if (!skill) return error("Skill 不存在", 404);
  return success(skill);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const validated = await validateBody(request, updateSkillSchema);
  if (!validated.ok) return validated.response;

  try {
    const skill = await withActor(resolveActor(request.headers), () =>
      updateSkill(id, validated.data),
    );
    return success(skill);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await withActor(resolveActor(request.headers), () => deleteSkill(id));
    return success({ message: "Skill 已归档" });
  } catch (err) {
    return handleApiError(err);
  }
}
