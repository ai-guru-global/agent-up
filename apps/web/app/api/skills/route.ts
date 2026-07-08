import { NextRequest } from "next/server";
import { success, error, parsePagination, paginationMeta, parseBody } from "@/lib/utils";
import { listSkills, createSkill } from "@/lib/services/skill-service";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  category: z.enum(["KNOWLEDGE_QUERY","DATA_FETCH","ACTION","TRANSFORM","GENERAL"]).optional(),
  triggerPatterns: z.array(z.string()).optional(),
  inputSchema: z.any().optional(),
  outputSchema: z.any().optional(),
  runtime: z.enum(["HTTP","FUNCTION","MCP","WORKFLOW"]).optional(),
  endpoint: z.string().optional(),
});

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
  const body = await parseBody(request);
  if (!body) return error("无效的请求体");
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return error("参数校验失败", 400, parsed.error.errors.map((e) => e.message));
  try {
    const skill = await createSkill(parsed.data);
    return success(skill, 201);
  } catch (err) {
    return error(err instanceof Error ? err.message : "创建失败", 500);
  }
}
