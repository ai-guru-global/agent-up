import { NextRequest } from "next/server";
import { success, parsePagination, paginationMeta } from "@/lib/utils";
import { listAudit } from "@/lib/services/audit-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip, take } = parsePagination(searchParams);

  const items = await listAudit({
    action: searchParams.get("action") || undefined,
    resource: searchParams.get("resource") || undefined,
    resourceId: searchParams.get("resourceId") || undefined,
    // 兼容：审计主键是 userName；userId 作为查询别名
    user: searchParams.get("userName") || searchParams.get("userId") || undefined,
  });

  const total = items.length;
  return success({
    items: items.slice(skip, skip + take),
    pagination: paginationMeta(page, pageSize, total),
  });
}
