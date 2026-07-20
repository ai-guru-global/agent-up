import { NextRequest } from "next/server";
import { store } from "@/lib/data/store";
import { success, error, parseBody } from "@/lib/utils";

export async function GET() {
  const groups = store.readArray<Record<string, unknown>>("settings", "product-groups.json");
  return success(groups);
}

export async function POST(request: NextRequest) {
  const body = await parseBody<{ name: string; displayName: string; description?: string }>(request);
  if (!body?.name || !body?.displayName) return error("name 和 displayName 必填");

  const groups = store.readArray<Record<string, unknown>>("settings", "product-groups.json");
  const ts = store.now();
  const group = {
    id: store.generateId(),
    name: body.name,
    displayName: body.displayName,
    description: body.description ?? null,
    createdAt: ts,
    updatedAt: ts,
    _count: { agents: 0, members: 0 },
  };
  groups.push(group);
  store.writeArray(groups, "settings", "product-groups.json");
  return success(group, 201);
}
