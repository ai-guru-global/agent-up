import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, validateBody, handleApiError } from "@/lib/utils";
import { updateRoleSchema } from "@/lib/schemas";
import { NotFoundError, AuthorizationError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit-service";
import { withActor, resolveActor } from "@/lib/context";

const roleInclude = {
  permissions: {
    orderBy: { permissionId: "asc" as const },
    include: { permission: { select: { id: true, resource: true, action: true } } },
  },
  _count: { select: { members: true } },
};

function toRoleResponse(role: {
  id: string;
  name: string;
  displayName: string;
  isSystem: boolean;
  description: string | null;
  permissions: { permission: { id: string; resource: string; action: string } }[];
  _count: { members: number };
}) {
  return {
    id: role.id,
    name: role.name,
    displayName: role.displayName,
    isSystem: role.isSystem,
    description: role.description,
    _count: { members: role._count.members },
    permissions: role.permissions.map((rp) => ({ permission: rp.permission })),
  };
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const validated = await validateBody(request, updateRoleSchema);
  if (!validated.ok) return validated.response;

  try {
    const role = await withActor(resolveActor(request.headers), async () => {
      const existing = await prisma.role.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError("角色不存在");
      const updated = await prisma.role.update({
        where: { id },
        data: {
          ...(validated.data.displayName !== undefined && {
            displayName: validated.data.displayName,
          }),
          ...(validated.data.description !== undefined && {
            description: validated.data.description,
          }),
        },
        include: roleInclude,
      });
      recordAudit("role.update", "role", id, validated.data);
      return toRoleResponse(updated);
    });
    return success(role);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await withActor(resolveActor(request.headers), async () => {
      const existing = await prisma.role.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError("角色不存在");
      if (existing.isSystem) throw new AuthorizationError("系统角色不可删除");
      await prisma.role.delete({ where: { id } });
      recordAudit("role.delete", "role", id);
    });
    return success({ message: "角色已删除" });
  } catch (err) {
    return handleApiError(err);
  }
}
