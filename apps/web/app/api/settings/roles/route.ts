import { NextRequest } from "next/server";
import { store } from "@/lib/data/store";
import { success, validateBody, handleApiError } from "@/lib/utils";
import { createRoleSchema } from "@/lib/schemas";
import { recordAudit } from "@/lib/services/audit-service";
import { withActor, resolveActor } from "@/lib/context";

export async function GET() {
  const roles = store.readArray<Record<string, unknown>>("settings", "roles.json");
  return success(roles);
}

export async function POST(request: NextRequest) {
  const validated = await validateBody(request, createRoleSchema);
  if (!validated.ok) return validated.response;

  try {
    const role = withActor(resolveActor(request.headers), () => {
      const roles = store.readArray<Record<string, unknown>>("settings", "roles.json");
      const newRole = {
        id: store.generateId(),
        name: validated.data.name,
        displayName: validated.data.displayName,
        isSystem: false,
        description: validated.data.description ?? null,
        _count: { members: 0 },
        permissions: [],
      };
      roles.push(newRole);
      store.writeArray(roles, "settings", "roles.json");
      recordAudit("role.create", "role", String(newRole.id), { name: validated.data.name });
      return newRole;
    });
    return success(role, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
