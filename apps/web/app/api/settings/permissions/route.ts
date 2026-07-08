import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, error, parseBody } from "@/lib/utils";

export async function GET() {
  const permissions = await prisma.permission.findMany({
    include: { _count: { select: { roles: true } } },
    orderBy: [{ resource: "asc" }, { action: "asc" }],
  });
  return success(permissions);
}

export async function POST(request: NextRequest) {
  const body = await parseBody<{resource: string; action: string; description?: string}>(request);
  if (!body?.resource || !body?.action) return error("resource 和 action 必填");
  try {
    const perm = await prisma.permission.create({
      data: { resource: body.resource, action: body.action, description: body.description },
    });
    return success(perm, 201);
  } catch (err) {
    return error(err instanceof Error ? err.message : "创建失败", 500);
  }
}
