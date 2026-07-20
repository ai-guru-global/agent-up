import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/utils";
import { getSkill, updateSkill, deleteSkill } from "@/lib/services/skill-service";

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
  const body = await parseBody<Record<string, unknown>>(request);
  if (!body) return error("无效的请求体");
  try {
    const skill = await updateSkill(id, body);
    return success(skill);
  } catch (err) {
    return error(err instanceof Error ? err.message : "更新失败", 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await deleteSkill(id);
    return success({ message: "Skill 已归档" });
  } catch (err) {
    return error(err instanceof Error ? err.message : "操作失败", 500);
  }
}
