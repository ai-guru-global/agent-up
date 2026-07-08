import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, parsePagination, paginationMeta } from "@/lib/utils";

/** GET /api/releases — 全局 Release 列表 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip, take } = parsePagination(searchParams);
  const status = searchParams.get("status") || undefined;
  const agentId = searchParams.get("agentId") || undefined;

  const where: Record<string, unknown> = {};
  if (status && status !== "ALL") where.status = status;
  if (agentId) where.agentId = agentId;

  const [items, total] = await Promise.all([
    prisma.release.findMany({
      where,
      skip,
      take,
      orderBy: { submittedAt: "desc" },
      include: {
        agent: { select: { id: true, name: true } },
        version: { select: { id: true, version: true, publishedAt: true } },
      },
    }),
    prisma.release.count({ where }),
  ]);

  return success({
    items,
    pagination: paginationMeta(page, pageSize, total),
  });
}
