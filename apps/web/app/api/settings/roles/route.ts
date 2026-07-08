import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, error, parseBody } from "@/lib/utils";

export async function GET() {
  const roles = await prisma.role.findMany({
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { members: true } },
    },
    orderBy: { name: "asc" },
  });
  return success(roles);
}

export async function POST(request: NextRequest) {
  const body = await parseBody<{name: string; displayName: string; description?: string}>(request);
  if (!body?.name || !body?.displayName) return error("name 和 displayName 必填");
  try {
    const role = await prisma.role.create({
      data: {
        name: body.name,
        displayName: body.displayName,
        description: body.description,
        isSystem: false,
      },
    });
    return success(role, 201);
  } catch (err) {
    return error(err instanceof Error ? err.message : "创建失败", 500);
  }
}
