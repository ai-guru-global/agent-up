import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, validateBody, handleApiError } from "@/lib/utils";
import { createPermissionSchema } from "@/lib/schemas";
import { ConflictError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit-service";
import { withActor, resolveActor } from "@/lib/context";

export async function GET() {
  const permissions = await prisma.permission.findMany({
    include: { _count: { select: { roles: true } } },
  });
  return success(
    permissions.map((p) => ({
      id: p.id,
      resource: p.resource,
      action: p.action,
      description: p.description,
      _count: { roles: p._count.roles },
    }))
  );
}

export async function POST(request: NextRequest) {
  const validated = await validateBody(request, createPermissionSchema);
  if (!validated.ok) return validated.response;

  try {
    const perm = await withActor(resolveActor(request.headers), async () => {
      const dup = await prisma.permission.findUnique({
        where: {
          resource_action: {
            resource: validated.data.resource,
            action: validated.data.action,
          },
        },
      });
      if (dup) throw new ConflictError("同名权限已存在");
      const created = await prisma.permission.create({
        data: {
          resource: validated.data.resource,
          action: validated.data.action,
          description: validated.data.description ?? null,
        },
        include: { _count: { select: { roles: true } } },
      });
      recordAudit("permission.create", "permission", created.id, {
        resource: validated.data.resource,
        action: validated.data.action,
      });
      return {
        id: created.id,
        resource: created.resource,
        action: created.action,
        description: created.description,
        _count: { roles: created._count.roles },
      };
    });
    return success(perm, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
