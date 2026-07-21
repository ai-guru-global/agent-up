import { NextRequest } from "next/server";
import { store } from "@/lib/data/store";
import { success, validateBody, handleApiError } from "@/lib/utils";
import { createProductGroupSchema } from "@/lib/schemas";
import { recordAudit } from "@/lib/services/audit-service";
import { withActor, resolveActor } from "@/lib/context";

export async function GET() {
  const groups = store.readArray<Record<string, unknown>>("settings", "product-groups.json");
  return success(groups);
}

export async function POST(request: NextRequest) {
  const validated = await validateBody(request, createProductGroupSchema);
  if (!validated.ok) return validated.response;

  try {
    const group = withActor(resolveActor(request.headers), () => {
      const groups = store.readArray<Record<string, unknown>>("settings", "product-groups.json");
      const ts = store.now();
      const newGroup = {
        id: store.generateId(),
        name: validated.data.name,
        displayName: validated.data.displayName,
        description: validated.data.description ?? null,
        createdAt: ts,
        updatedAt: ts,
        _count: { agents: 0, members: 0 },
      };
      groups.push(newGroup);
      store.writeArray(groups, "settings", "product-groups.json");
      recordAudit("product_group.create", "product-group", String(newGroup.id), {
        name: validated.data.name,
      });
      return newGroup;
    });
    return success(group, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
