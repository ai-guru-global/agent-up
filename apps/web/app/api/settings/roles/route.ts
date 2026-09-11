import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, validateBody, handleApiError } from "@/lib/utils";
import { createRoleSchema } from "@/lib/schemas";
import { recordAudit } from "@/lib/services/audit-service";
import { withActor, resolveActor } from "@/lib/context";

const roleInclude = {
  permissions: {
    orderBy: { permissionId: "asc" as const },
    include: { permission: { select: { id: true, resource: true, action: true } } },
  },
  _count: { select: { members: true } },
};

type RoleWithRelations = {
  id: string;
  name: string;
  displayName: string;
  isSystem: boolean;
  description: string | null;
  permissions: { permission: { id: string; resource: string; action: string } }[];
  _count: { members: number };
};

function toRoleResponse(role: RoleWithRelations) {
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

export async function GET() {
  const roles = await prisma.role.findMany({ include: roleInclude });
  return success(roles.map(toRoleResponse));
}

export async function POST(request: NextRequest) {
  const validated = await validateBody(request, createRoleSchema);
  if (!validated.ok) return validated.response;

  try {
    const role = await withActor(resolveActor(request.headers), async () => {
      const created = await prisma.role.create({
        data: {
          name: validated.data.name,
          displayName: validated.data.displayName,
          description: validated.data.description ?? null,
          isSystem: false,
        },
        include: roleInclude,
      });
      recordAudit("role.create", "role", created.id, { name: validated.data.name });
      return toRoleResponse(created);
    });
    return success(role, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
