/**
 * 发布前 AI 评测（replay + judge）：用待发布快照的配置重放评测用例，
 * 由 LLM 判官对照参考回复给出 PASS / FAIL，结果写回 release.aiReview。
 *
 * 评测语义：
 * - 只允许对 PENDING release 运行（审批一旦完成，快照已不可变，评测无意义）。
 * - replay 用 release.configSnapshot 里的 prompt 分区（即提交时刻的配置），
 *   与 Playground 共用 buildSystemPrompt 组装 —— 保证「发布时测的就是发布时跑的」。
 * - 每个用例两步 LLM 调用：先生成候选回复（replay），再让判官对比
 *   参考回复（沉淀时刻的回复）与候选回复。单个用例失败（上游错误 / 输出
 *   无法解析）不中断整轮，记入 errorCases 并由人工兜底。
 * - 评测结论是给审批人的参考信号，不硬性阻断审批 —— LLM 判官可能误判，
 *   最终决定权仍在人。
 */
import { store } from "@/lib/data/store";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit-service";
import { chatCompletion, isLlmConfigured, LlmUpstreamError, type LlmMessage } from "@/lib/services/llm-service";
import { buildSystemPrompt } from "@/lib/services/prompt-builder";
import type { EvalCase } from "@/lib/services/eval-case-service";

export type AiReviewStatus = "PASSED" | "FAILED" | "SKIPPED";
export type CaseVerdict = "PASS" | "FAIL" | "ERROR";

export interface AiReviewCaseResult {
  caseId: string;
  title: string;
  verdict: CaseVerdict;
  score: number | null;
  reason: string;
}

export interface AiReviewResult {
  status: AiReviewStatus;
  runAt: string;
  model: string;
  totalCases: number;
  passed: number;
  failed: number;
  errorCases: number;
  summary: string;
  results: AiReviewCaseResult[];
}

interface JudgeOutput {
  verdict: "PASS" | "FAIL";
  score: number;
  reason: string;
}

/** 判官 system 提示：要求 JSON 输出（与 response_format=json_object 配套）。 */
const JUDGE_SYSTEM = `你是发布评测官。用户会给出：一个 Agent 的评测用例（问题与期望行为）、该用例的参考回复、以及该 Agent 在新配置下的候选回复。
请判断候选回复是否达到发布标准，只输出 JSON，不要输出任何其他文字：
{"verdict":"PASS"或"FAIL","score":1到5的整数,"reason":"中文理由，50字以内"}

判定标准：
1. 是否直接、完整地解决了用户的问题；
2. 是否忠实（未编造事实、未承诺能力之外的事）；
3. 语气、结构与约束遵守情况（参考该 Agent 的角色约束）。
候选回复与参考回复语义等价或更优 → PASS；明显缺失关键步骤、编造信息、答非所问、违反约束 → FAIL。
score 3 分及以上才可判 PASS。`;

/** 截断超长文本，控制判官上下文（回复可能很长，评测只关心要点对齐）。 */
function clip(text: string, max = 1500): string {
  return text.length > max ? `${text.slice(0, max)}…（已截断）` : text;
}

/** 从模型输出里尽力提取 JSON（容错围栏与前后杂讯）。 */
function parseJudgeJson(raw: string): JudgeOutput | null {
  const stripped = raw.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1)) as Partial<JudgeOutput>;
    if ((parsed.verdict === "PASS" || parsed.verdict === "FAIL") &&
        typeof parsed.score === "number") {
      return {
        verdict: parsed.verdict,
        score: Math.min(5, Math.max(1, Math.round(parsed.score))),
        reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : "",
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** 对单个用例执行 replay + judge。失败返回 verdict=ERROR 的结果，不抛出。 */
async function evaluateCase(evalCase: EvalCase, systemPrompt: string): Promise<AiReviewCaseResult> {
  const base = { caseId: evalCase.id, title: evalCase.title };
  try {
    const replayMsgs: LlmMessage[] = [
      { role: "system", content: systemPrompt },
      ...(evalCase.history ?? []),
      { role: "user", content: evalCase.message },
    ];
    const candidate = await chatCompletion({ messages: replayMsgs });

    const judgeUser = [
      `## 用例\n标题：${evalCase.title}\n期望行为：${evalCase.expectation}\n问题：${clip(evalCase.message)}`,
      `## 参考回复（上一版配置的表现）\n${clip(evalCase.referenceReply)}`,
      `## 候选回复（本次待发布配置的表现）\n${clip(candidate.content)}`,
    ].join("\n\n");

    const judge = await chatCompletion({
      messages: [
        { role: "system", content: JUDGE_SYSTEM },
        { role: "user", content: judgeUser },
      ],
      maxCompletionTokens: 600,
      responseFormat: "json_object",
    });

    const parsed = parseJudgeJson(judge.content);
    if (!parsed) {
      return {
        ...base,
        verdict: "ERROR",
        score: null,
        reason: "判官输出无法解析为 JSON，请人工复核",
      };
    }
    return { ...base, verdict: parsed.verdict, score: parsed.score, reason: parsed.reason || "（无理由）" };
  } catch (err) {
    const reason =
      err instanceof LlmUpstreamError || (err instanceof Error && err.name === "TimeoutError")
        ? err.message.slice(0, 200)
        : err instanceof Error ? err.message.slice(0, 200) : "评测过程异常";
    return { ...base, verdict: "ERROR", score: null, reason };
  }
}

export async function runAiReview(releaseId: string): Promise<Record<string, unknown>> {
  const release = store.read<Record<string, unknown>>("releases", `${releaseId}.json`);
  if (!release) throw new NotFoundError("Release 不存在");
  if (release.status !== "PENDING") {
    throw new ConflictError(`只有待审批的 Release 可以运行 AI 评测（当前状态：${release.status}）`);
  }
  const agentId = String(release.agentId ?? "");
  const agent = store.read<{ id: string; name: string; promptConfig?: Record<string, unknown> | null }>(
    "agents",
    `${agentId}.json`,
  );
  if (!agent) throw new NotFoundError("Agent 不存在，无法评测");

  const ts = store.now();
  const model = process.env.MIMO_MODEL || "mimo-v2.5-pro";

  const skip = (reason: string): Record<string, unknown> => {
    const aiReview: AiReviewResult = {
      status: "SKIPPED",
      runAt: ts,
      model,
      totalCases: 0,
      passed: 0,
      failed: 0,
      errorCases: 0,
      summary: reason,
      results: [],
    };
    store.write({ ...release, aiReview }, "releases", `${releaseId}.json`);
    recordAudit("release.ai_review", "release", releaseId, { agentId, status: "SKIPPED", reason });
    return { ...release, aiReview };
  };

  if (!isLlmConfigured()) {
    return skip("LLM 未配置（缺少 MIMO_API_KEY），跳过 AI 评测");
  }

  const cases = store
    .list<EvalCase>("eval-cases")
    .filter((c) => c.agentId === agentId && c.status === "ACTIVE");
  if (cases.length === 0) {
    return skip("该 Agent 还没有评测用例（先在 Playground 打分并沉淀），跳过 AI 评测");
  }

  // replay 用提交快照的 prompt 分区；快照缺失时退回 Agent 当前配置
  const snapshot = (release.configSnapshot as Record<string, unknown> | null) ?? {};
  const snapshotPrompt = (snapshot.prompt as Record<string, unknown> | null) ?? agent.promptConfig ?? {};
  const systemPrompt = buildSystemPrompt(snapshotPrompt as Parameters<typeof buildSystemPrompt>[0]);

  const results: AiReviewCaseResult[] = [];
  for (const evalCase of cases) {
    results.push(await evaluateCase(evalCase, systemPrompt));
  }

  const passed = results.filter((r) => r.verdict === "PASS").length;
  const failed = results.filter((r) => r.verdict === "FAIL").length;
  const errorCases = results.filter((r) => r.verdict === "ERROR").length;
  const status: AiReviewStatus = errorCases === results.length && results.length > 0
    ? "SKIPPED"
    : failed > 0 || errorCases > 0
      ? "FAILED"
      : "PASSED";
  const summary =
    status === "PASSED"
      ? `全部 ${passed} 个用例通过，建议批准发布`
      : status === "FAILED"
        ? `${failed} 个用例未达标${errorCases > 0 ? `，另有 ${errorCases} 个用例评测失败需人工复核` : ""}，建议驳回或要求修改后重测`
        : "评测全部失败，请人工复核";

  const aiReview: AiReviewResult = {
    status,
    runAt: ts,
    model,
    totalCases: results.length,
    passed,
    failed,
    errorCases,
    summary,
    results,
  };
  store.write({ ...release, aiReview }, "releases", `${releaseId}.json`);
  recordAudit("release.ai_review", "release", releaseId, {
    agentId,
    status,
    passed,
    failed,
    errorCases,
  });
  return { ...release, aiReview };
}
