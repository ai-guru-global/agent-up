import { NextRequest } from "next/server";
import { store } from "@/lib/data/store";
import { success, error, parseBody } from "@/lib/utils";

export async function GET() {
  const permissions = store.readArray<Record<string, unknown>>("settings", "permissions.json");
  return success(permissions);
}

export async function POST(request: NextRequest) {
  const body = await parseBody<{ resource: string; action: string; description?: string }>(request);
  if (!body?.resource || !body?.action) return error("resource 和 action 必填");

  const permissions = store.readArray<Record<string, unknown>>("settings", "permissions.json");
  const perm = {
    id: store.generateId(),
    resource: body.resource,
    action: body.action,
    description: body.description ?? null,
    _count: { roles: 0 },
  };
  permissions.push(perm);
  store.writeArray(permissions, "settings", "permissions.json");
  return success(perm, 201);
}
