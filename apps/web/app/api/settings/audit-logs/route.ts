import { NextRequest } from "next/server";
import { store } from "@/lib/data/store";
import { success, parsePagination, paginationMeta } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip, take } = parsePagination(searchParams);
  const action = searchParams.get("action") || undefined;
  const resource = searchParams.get("resource") || undefined;
  const resourceId = searchParams.get("resourceId") || undefined;
  // 兼容：审计日志主键是 userName；userId 作为别名
  const user = searchParams.get("userName") || searchParams.get("userId") || undefined;

  let items = store.readArray<Record<string, unknown>>("settings", "audit-logs.json");
  if (action) items = items.filter((l) => l.action === action);
  if (resource) items = items.filter((l) => l.resource === resource);
  if (resourceId) items = items.filter((l) => l.resourceId === resourceId);
  if (user) items = items.filter((l) => l.userName === user || l.userId === user);

  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const total = items.length;
  items = items.slice(skip, skip + take);

  return success({ items, pagination: paginationMeta(page, pageSize, total) });
}
