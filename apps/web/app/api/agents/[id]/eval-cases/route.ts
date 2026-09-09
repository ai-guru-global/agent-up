import { NextRequest } from "next/server";
import { success, handleApiError, validateBody } from "@/lib/utils";
import { NotFoundError } from "@/lib/errors";
import { store } from "@/lib/data/store";
import { createEvalCaseSchema } from "@/lib/schemas";
import {
  listEvalCases,
  createEvalCaseFromTrace,
} from "@/lib/services/eval-case-service";

/**
 * GET/POST /api/agents/[id]/eval-cases — 该 Agent 的评测用例库。
 *
 * GET：全部用例（按沉淀时间倒序），供 Playground 沉淀后复查、管理。
 * POST：把一条已打分的试聊 trace 沉淀为评测用例（body: traceId +
 * 可选 expectation）。trace 必须属于该 Agent；沉淀内容含完整输入 +
 * 参考回复，作为发布 AI 评测的 replay 语料。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const agent = store.read("agents", `${id}.json`);
    if (!agent) throw new NotFoundError("Agent 不存在");
    return success({ items: listEvalCases(id) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const agent = store.read("agents", `${id}.json`);
    if (!agent) throw new NotFoundError("Agent 不存在");

    const validated = await validateBody(request, createEvalCaseSchema);
    if (!validated.ok) return validated.response;
    const { traceId, expectation, assertions } = validated.data;

    const evalCase = createEvalCaseFromTrace(id, traceId, expectation, assertions);
    return success(evalCase, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
