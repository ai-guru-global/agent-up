import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, error, parseBody } from "@/lib/utils";
import { bindSkill, unbindSkill } from "@/lib/services/skill-service";

/** GET /api/agents/[id]/skills — 获取 Agent 绑定的 Skills */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const bindings = await prisma.agentSkillBinding.findMany({
    where: { agentId: id },
    include: {
      skill: { select: { id: true, name: true, displayName: true, category: true, description: true, status: true } },
    },
    orderBy: { priority: "desc" },
  });
  return success(bindings);
}

/** POST /api/agents/[id]/skills — 绑定 Skill */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await parseBody<{ skillId: string; config?: unknown }>(request);
  if (!body?.skillId) return error("skillId 必填");
  try {
    const binding = await bindSkill(id, body.skillId, body.config);
    return success(binding, 201);
  } catch (err) {
    return error(err instanceof Error ? err.message : "绑定失败", 500);
  }
}

/** DELETE /api/agents/[id]/skills — 解绑 Skill */
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
