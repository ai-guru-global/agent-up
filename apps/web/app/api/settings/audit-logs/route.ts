import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, parsePagination, paginationMeta } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip, take } = parsePagination(searchParams);
  const action = searchParams.get("action") || undefined;
  const resource = searchParams.get("resource") || undefined;
  const userId = searchParams.get("userId") || undefined;

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (resource) where.resource = resource;
  if (userId) where.userId = userId;

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip, take,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return success({ items, pagination: paginationMeta(page, pageSize, total) });
}
