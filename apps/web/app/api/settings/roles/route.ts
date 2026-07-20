import { NextRequest } from "next/server";
import { store } from "@/lib/data/store";
import { success, error, parseBody } from "@/lib/utils";

export async function GET() {
  const roles = store.readArray<Record<string, unknown>>("settings", "roles.json");
  return success(roles);
}

export async function POST(request: NextRequest) {
  const body = await parseBody<{ name: string; displayName: string; description?: string }>(request);
  if (!body?.name || !body?.displayName) return error("name 和 displayName 必填");

  const roles = store.readArray<Record<string, unknown>>("settings", "roles.json");
  const role = {
    id: store.generateId(),
    name: body.name,
    displayName: body.displayName,
    isSystem: false,
    description: body.description ?? null,
    _count: { members: 0 },
    permissions: [],
  };
  roles.push(role);
  store.writeArray(roles, "settings", "roles.json");
  return success(role, 201);
}
