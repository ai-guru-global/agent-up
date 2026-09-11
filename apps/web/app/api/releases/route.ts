import { NextRequest } from "next/server";
import { prisma, Prisma } from "@agent-up/db";
import { success, parsePagination, paginationMeta } from "@/lib/utils";
import { toReleaseResponse } from "@/lib/services/agent-service";
import { VALID_RELEASE_STATUSES } from "@/lib/services/release-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip, take } = parsePagination(searchParams);
  const status = searchParams.get("status") || undefined;
  const agentId = searchParams.get("agentId") || undefined;

  // JSON 契约：未知 status 过滤结果为空（不回退为全量）
  if (status && status !== "ALL" && !(VALID_RELEASE_STATUSES as readonly string[]).includes(status)) {
    return success({ items: [], pagination: paginationMeta(page, pageSize, 0) });
  }

  const where: Prisma.ReleaseWhereInput = {
    ...(status && status !== "ALL" && {
      status: status as (typeof VALID_RELEASE_STATUSES)[number],
    }),
    ...(agentId && { agentId }),
  };

  const [rows, total] = await Promise.all([
    prisma.release.findMany({
      where,
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      skip,
      take,
      include: {
        agent: { select: { id: true, name: true } },
        version: true,
      },
    }),
    prisma.release.count({ where }),
  ]);

  return success({
    items: rows.map((row) => ({
      ...toReleaseResponse(row),
      agent: { id: row.agent.id, name: row.agent.name },
    })),
    pagination: paginationMeta(page, pageSize, total),
  });
}
