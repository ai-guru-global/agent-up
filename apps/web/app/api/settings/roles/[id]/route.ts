import { NextRequest } from "next/server";
import { store } from "@/lib/data/store";
import { success, validateBody, handleApiError } from "@/lib/utils";
import { updateRoleSchema } from "@/lib/schemas";
import { NotFoundError, AuthorizationError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit-service";
import { withActor, resolveActor } from "@/lib/context";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const validated = await validateBody(request, updateRoleSchema);
  if (!validated.ok) return validated.response;

  try {
    const updated = withActor(resolveActor(request.headers), () => {
      const roles = store.readArray<Record<string, unknown>>("settings", "roles.json");
      const idx = roles.findIndex((r) => r.id === id);
      if (idx === -1) throw new NotFoundError("角色不存在");

      roles[idx] = {
        ...roles[idx],
        ...(validated.data.displayName !== undefined && { displayName: validated.data.displayName }),
        ...(validated.data.description !== undefined && { description: validated.data.description }),
      };
      store.writeArray(roles, "settings", "roles.json");
      recordAudit("role.update", "role", id, validated.data);
      return roles[idx];
    });
    return success(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    withActor(resolveActor(request.headers), () => {
      const roles = store.readArray<Record<string, unknown>>("settings", "roles.json");
      const idx = roles.findIndex((r) => r.id === id);
      if (idx === -1) throw new NotFoundError("角色不存在");
      if (roles[idx].isSystem) {
        throw new AuthorizationError("系统角色不可删除");
      }
      roles.splice(idx, 1);
      store.writeArray(roles, "settings", "roles.json");
      recordAudit("role.delete", "role", id);
    });
    return success({ message: "角色已删除" });
  } catch (err) {
    return handleApiError(err);
  }
}
