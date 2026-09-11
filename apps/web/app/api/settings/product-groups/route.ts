import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, validateBody, handleApiError } from "@/lib/utils";
import { createProductGroupSchema } from "@/lib/schemas";
import { ConflictError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit-service";
import { withActor, resolveActor } from "@/lib/context";

const groupInclude = { _count: { select: { agents: true, members: true } } };

export async function GET() {
  const groups = await prisma.productGroup.findMany({ include: groupInclude });
  return success(
    groups.map((g) => ({
      id: g.id,
      name: g.name,
      displayName: g.displayName,
      description: g.description,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      _count: { agents: g._count.agents, members: g._count.members },
    }))
  );
}

export async function POST(request: NextRequest) {
  const validated = await validateBody(request, createProductGroupSchema);
  if (!validated.ok) return validated.response;

  try {
    const group = await withActor(resolveActor(request.headers), async () => {
      const dup = await prisma.productGroup.findUnique({
        where: { name: validated.data.name },
      });
      if (dup) throw new ConflictError("同名产品组已存在");
      const created = await prisma.productGroup.create({
        data: {
          name: validated.data.name,
          displayName: validated.data.displayName,
          description: validated.data.description ?? null,
        },
        include: groupInclude,
      });
      recordAudit("product_group.create", "product-group", created.id, {
        name: validated.data.name,
      });
      return {
        id: created.id,
        name: created.name,
        displayName: created.displayName,
        description: created.description,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        _count: { agents: created._count.agents, members: created._count.members },
      };
    });
    return success(group, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
