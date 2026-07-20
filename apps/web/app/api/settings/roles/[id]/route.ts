import { NextRequest } from "next/server";
import { store } from "@/lib/data/store";
import { success, error, parseBody } from "@/lib/utils";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody<{ displayName?: string; description?: string }>(request);
  if (!body) return error("无效的请求体");

  const roles = store.readArray<Record<string, unknown>>("settings", "roles.json");
  const idx = roles.findIndex((r) => r.id === id);
  if (idx === -1) return error("角色不存在", 404);

  roles[idx] = {
    ...roles[idx],
    ...(body.displayName !== undefined && { displayName: body.displayName }),
    ...(body.description !== undefined && { description: body.description }),
  };

  store.writeArray(roles, "settings", "roles.json");
  return success(roles[idx]);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const roles = store.readArray<Record<string, unknown>>("settings", "roles.json");
  const idx = roles.findIndex((r) => r.id === id);
  if (idx === -1) return error("角色不存在", 404);
  if (roles[idx].isSystem) return error("系统角色不可删除", 403);

  roles.splice(idx, 1);
  store.writeArray(roles, "settings", "roles.json");
  return success({ message: "角色已删除" });
}
