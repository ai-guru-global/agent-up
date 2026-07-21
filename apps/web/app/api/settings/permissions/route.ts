import { NextRequest } from "next/server";
import { store } from "@/lib/data/store";
import { success, validateBody, handleApiError } from "@/lib/utils";
import { createPermissionSchema } from "@/lib/schemas";
import { recordAudit } from "@/lib/services/audit-service";
import { withActor, resolveActor } from "@/lib/context";

export async function GET() {
  const permissions = store.readArray<Record<string, unknown>>("settings", "permissions.json");
  return success(permissions);
}

export async function POST(request: NextRequest) {
  const validated = await validateBody(request, createPermissionSchema);
  if (!validated.ok) return validated.response;

  try {
    const perm = withActor(resolveActor(request.headers), () => {
      const permissions = store.readArray<Record<string, unknown>>("settings", "permissions.json");
      const newPerm = {
        id: store.generateId(),
        resource: validated.data.resource,
        action: validated.data.action,
        description: validated.data.description ?? null,
        _count: { roles: 0 },
      };
      permissions.push(newPerm);
      store.writeArray(permissions, "settings", "permissions.json");
      recordAudit("permission.create", "permission", String(newPerm.id), {
        resource: validated.data.resource,
        action: validated.data.action,
      });
      return newPerm;
    });
    return success(perm, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
