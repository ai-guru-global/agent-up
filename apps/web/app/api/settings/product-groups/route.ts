import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, error, parseBody } from "@/lib/utils";

export async function GET() {
  const groups = await prisma.productGroup.findMany({
    include: {
      _count: { select: { agents: true, members: true } },
    },
    orderBy: { name: "asc" },
  });
  return success(groups);
}

export async function POST(request: NextRequest) {
  const body = await parseBody<{name: string; displayName: string; description?: string}>(request);
  if (!body?.name || !body?.displayName) return error("name 和 displayName 必填");
  try {
    const group = await prisma.productGroup.create({
      data: { name: body.name, displayName: body.displayName, description: body.description },
    });
    return success(group, 201);
  } catch (err) {
    return error(err instanceof Error ? err.message : "创建失败", 500);
  }
}
