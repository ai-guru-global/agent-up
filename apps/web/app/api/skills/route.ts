import { NextRequest } from "next/server";
import { success, parsePagination, paginationMeta, validateBody, handleApiError } from "@/lib/utils";
import { createSkillSchema } from "@/lib/schemas";
import { listSkills, createSkill } from "@/lib/services/skill-service";
import { withActor, resolveActor } from "@/lib/context";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip, take } = parsePagination(searchParams);
  const category = searchParams.get("category") || undefined;
  const status = searchParams.get("status") || undefined;
  const search = searchParams.get("search") || undefined;

  const { items, total } = await listSkills({ skip, take, category, status, search });
  return success({ items, pagination: paginationMeta(page, pageSize, total) });
}

export async function POST(request: NextRequest) {
  const validated = await validateBody(request, createSkillSchema);
  if (!validated.ok) return validated.response;

  try {
    const skill = await withActor(resolveActor(request.headers), () =>
      createSkill(validated.data),
    );
    return success(skill, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
