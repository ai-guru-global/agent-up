import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, error, parseBody } from "@/lib/utils";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody<{displayName?: string; description?: string}>(request);
  if (!body) return error("无效的请求体");
  try {
    const role = await prisma.role.update({
      where: { id },
      data: {
        ...(body.displayName !== undefined && { displayName: body.displayName }),
        ...(body.description !== undefined && { description: body.description }),
      },
    });
    return success(role);
  } catch (err) {
    return error(err instanceof Error ? err.message : "更新失败", 500);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) return error("角色不存在", 404);
  if (role.isSystem) return error("系统角色不可删除", 403);
  try {
    await prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await prisma.userRole.deleteMany({ where: { roleId: id } });
    await prisma.role.delete({ where: { id } });
    return success({ message: "角色已删除" });
  } catch (err) {
    return error(err instanceof Error ? err.message : "删除失败", 500);
  }
}
