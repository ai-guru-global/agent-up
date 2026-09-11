import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma, Prisma } from "@agent-up/db";
import { POST as agentChat } from "@/app/api/agents/[id]/chat/route";
import { POST as rateTrace } from "@/app/api/traces/[id]/rate/route";
import {
  GET as listEvalCases,
  POST as createEvalCase,
} from "@/app/api/agents/[id]/eval-cases/route";
import { DELETE as removeEvalCase } from "@/app/api/eval-cases/[id]/route";
import { POST as runAiReview } from "@/app/api/releases/[id]/ai-review/route";
import { resetActor } from "@/lib/context";
import { _resetDb } from "@/lib/data/test-db";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";

/**
 * 「试聊 → 打分 → 沉淀评测用例 → 发布 AI 评测」闭环集成测试。
 * 统一 mock global.fetch（replay 与 judge 按请求内容分流），绝不发真实请求。
 */
const LLM_REPLY = {
  model: "mimo-v2.5-pro",
  choices: [{ message: { role: "assistant", content: "LLM-MOCK-CONTENT" } }],
  usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
};

/** 按请求内容分流：judge 请求（user 含 "## 候选回复"）返回结构化 JSON，其余返回普通回复 */
function stubLlmWithJudge() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ role: string; content: string }>;
      };
      const lastUser =
        [...(body.messages ?? [])]
          .reverse()
          .find((m) => m.role === "user")?.content ?? "";
      if (lastUser.includes("## 候选回复")) {
        return new Response(
          JSON.stringify({
            ...LLM_REPLY,
            choices: [
              { message: { content: JSON.stringify({ verdict: "PASS", score: 5, reason: "覆盖参考要点" }) } },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          ...LLM_REPLY,
          choices: [{ message: { content: "LLM-MOCK-CONTENT" } }],
        }),
        { status: 200 },
      );
    }),
  );
}

beforeEach(async () => {
  resetActor();
  useTempDataDir();
  await _resetDb();
  process.env.MIMO_API_KEY = "tp-test";
  stubLlmWithJudge();
});

afterEach(() => {
  restoreDataDir();
  vi.unstubAllGlobals();
  delete process.env.MIMO_API_KEY;
});

/** 批4 起全部事实源在 PG：建档走 prisma */
async function writeAgent(id: string) {
  await prisma.productGroup.create({
    data: { id: `g-${id}`, name: `g-${id}`, displayName: `${id} 产品组` },
  });
  await prisma.agent.create({
    data: { id, name: `助手-${id}`, productGroupId: `g-${id}`, createdBy: "seed" },
  });
  await prisma.promptConfig.create({
    data: {
      agentId: id,
      systemPrompt: `你是助手 ${id}`,
      roleDefinition: null,
      constraints: ["不回答无关问题"],
      outputFormat: null,
    },
  });
}

async function chatOnce(agentId: string, message: string): Promise<{ traceId: string; reply: string }> {
  const res = await agentChat(
    new NextRequest("http://localhost", {
      method: "POST",
      body: JSON.stringify({ message, history: [] }),
    }),
    { params: Promise.resolve({ id: agentId }) },
  );
  const json = await res.json();
  expect(json.success).toBe(true);
  return json.data as { traceId: string; reply: string };
}

describe("试聊 trace 闭环", () => {
  it("chat 成功后落盘 trace 并返回 traceId", async () => {
    await writeAgent("a1");
    const { traceId, reply } = await chatOnce("a1", "ECS 挂了怎么办");
    expect(reply).toBe("LLM-MOCK-CONTENT");
    expect(traceId).toBeTruthy();
    const trace = await prisma.trace.findUnique({ where: { id: traceId } });
    expect(trace).not.toBeNull();
    expect(trace?.agentId).toBe("a1");
    expect(trace?.message).toBe("ECS 挂了怎么办");
    expect(trace?.reply).toBe("LLM-MOCK-CONTENT");
    expect(trace?.rating).toBeNull();
    // system prompt 与既有组装约定一致：含 systemPrompt 与约束
    expect(trace?.systemPrompt).toContain("你是助手 a1");
    expect(trace?.systemPrompt).toContain("不回答无关问题");
  });

  it("打分写入 trace（UP → DOWN 覆盖），非法 rating 422，不存在 404", async () => {
    await writeAgent("a2");
    const { traceId } = await chatOnce("a2", "磁盘扩容了没变化");

    const up = await rateTrace(
      new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({ rating: "UP", note: "回答清晰" }),
      }),
      { params: Promise.resolve({ id: traceId }) },
    );
    const upJson = await up.json();
    expect(up.status).toBe(200);
    expect(upJson.data.rating).toBe("UP");
    expect((await prisma.trace.findUnique({ where: { id: traceId } }))?.ratedAt).toBeTruthy();

    const down = await rateTrace(
      new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({ rating: "DOWN" }),
      }),
      { params: Promise.resolve({ id: traceId }) },
    );
    expect((await down.json()).data.rating).toBe("DOWN");

    const bad = await rateTrace(
      new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({ rating: "MAYBE" }),
      }),
      { params: Promise.resolve({ id: traceId }) },
    );
    expect(bad.status).toBe(422);

    const ghost = await rateTrace(
      new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({ rating: "UP" }),
      }),
      { params: Promise.resolve({ id: "no-such-trace" }) },
    );
    expect(ghost.status).toBe(404);
  });
});

describe("评测用例沉淀", () => {
  it("打分后可沉淀为用例，列表可见，期望行为写入", async () => {
    await writeAgent("b1");
    const { traceId } = await chatOnce("b1", "实例无法 SSH 连接怎么排查");

    const create = await createEvalCase(
      new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          traceId,
          expectation: "先确认现象再给排查步骤",
        }),
      }),
      { params: Promise.resolve({ id: "b1" }) },
    );
    const created = await create.json();
    expect(create.status).toBe(201);
    expect(created.data.title).toBe("实例无法 SSH 连接怎么排查");
    expect(created.data.expectation).toBe("先确认现象再给排查步骤");
    expect(created.data.referenceReply).toBe("LLM-MOCK-CONTENT");
    expect(created.data.sourceTraceId).toBe(traceId);

    const list = await listEvalCases(new NextRequest("http://localhost"), {
      params: Promise.resolve({ id: "b1" }),
    });
    const listJson = await list.json();
    expect(listJson.success).toBe(true);
    expect(listJson.data.items).toHaveLength(1);
    expect(listJson.data.items[0].id).toBe(created.data.id);
  });

  it("trace 不存在 404；trace 属于其他 Agent 422", async () => {
    await writeAgent("c1");
    await writeAgent("c2");
    const { traceId } = await chatOnce("c1", "问点什么");

    const missing = await createEvalCase(
      new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({ traceId: "ghost" }),
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(missing.status).toBe(404);

    const crossAgent = await createEvalCase(
      new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({ traceId }),
      }),
      { params: Promise.resolve({ id: "c2" }) },
    );
    expect(crossAgent.status).toBe(422);
  });

  it("可删除用例；重复删除 404", async () => {
    await writeAgent("d1");
    const { traceId } = await chatOnce("d1", "删除我这条");
    const create = await createEvalCase(
      new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({ traceId }),
      }),
      { params: Promise.resolve({ id: "d1" }) },
    );
    const { id } = (await create.json()).data as { id: string };

    const del = await removeEvalCase(new NextRequest("http://localhost"), {
      params: Promise.resolve({ id }),
    });
    expect(del.status).toBe(200);
    expect((await del.json()).data.deleted).toBe(true);

    const again = await removeEvalCase(new NextRequest("http://localhost"), {
      params: Promise.resolve({ id }),
    });
    expect(again.status).toBe(404);
  });
});

describe("发布前 AI 评测（replay + judge）", () => {
  async function writePendingRelease(agentId: string, releaseId: string) {
    await prisma.release.create({
      data: {
        id: releaseId,
        agentId,
        changeNote: "收紧高危操作提示",
        changedPartitions: ["PROMPT"],
        status: "PENDING",
        submittedBy: "tester",
        submittedAt: new Date("2026-08-20T00:00:00.000Z"),
        configSnapshot: {
          prompt: { systemPrompt: "新版提示词：高危操作前提醒快照" },
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async function writeEvalCase(agentId: string, caseId: string) {
    await prisma.evalCase.create({
      data: {
        id: caseId,
        agentId,
        sourceTraceId: "t-1",
        title: "磁盘扩容后容量没变化",
        expectation: "必须先提醒创建快照",
        systemPrompt: "旧版提示词",
        history: [],
        message: "扩容后 df -h 没变化",
        referenceReply: "先做快照再 growpart/resize2fs",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        createdBy: "tester",
      },
    });
  }

  it("replay 使用 release 快照 prompt 并写回 PASSED 结果", async () => {
    await writeAgent("e1");
    await writePendingRelease("e1", "rel-e1");
    await writeEvalCase("e1", "case-e1");

    const res = await runAiReview(new NextRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "rel-e1" }),
    });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    const review = json.data.aiReview as {
      status: string;
      passed: number;
      failed: number;
      results: Array<{ verdict: string; score: number; reason: string }>;
    };
    expect(review.status).toBe("PASSED");
    expect(review.passed).toBe(1);
    expect(review.failed).toBe(0);
    expect(review.results[0].verdict).toBe("PASS");
    expect(review.results[0].score).toBe(5);
    expect(review.results[0].reason).toBe("覆盖参考要点");

    // 落盘可见：release 行已带 aiReview
    const persisted = await prisma.release.findUnique({ where: { id: "rel-e1" } });
    const persistedReview = persisted?.aiReview as { status?: string } | null;
    expect(persistedReview?.status).toBe("PASSED");

    // replay 请求的 system prompt 来自 release 快照（新提示词），而非用例旧提示词
    const calls = vi.mocked(fetch).mock.calls;
    const replayBody = JSON.parse(String((calls[0]?.[1] as RequestInit).body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(replayBody.messages[0].content).toContain("新版提示词：高危操作前提醒快照");
    expect(replayBody.messages[0].content).not.toContain("旧版提示词");
  });

  it("用例全 FAIL 时整轮 FAILED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          messages?: Array<{ role: string; content: string }>;
        };
        const lastUser =
          [...(body.messages ?? [])].reverse().find((m) => m.role === "user")?.content ?? "";
        if (lastUser.includes("## 候选回复")) {
          return new Response(
            JSON.stringify({
              ...LLM_REPLY,
              choices: [
                { message: { content: JSON.stringify({ verdict: "FAIL", score: 2, reason: "遗漏快照提醒" }) } },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({ ...LLM_REPLY, choices: [{ message: { content: "没提快照的回复" } }] }),
          { status: 200 },
        );
      }),
    );
    await writeAgent("f1");
    await writePendingRelease("f1", "rel-f1");
    await writeEvalCase("f1", "case-f1");

    const res = await runAiReview(new NextRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "rel-f1" }),
    });
    const json = await res.json();
    expect(json.data.aiReview.status).toBe("FAILED");
    expect(json.data.aiReview.failed).toBe(1);
    expect(json.data.aiReview.summary).toContain("驳回");
  });

  it("无评测用例 → SKIPPED", async () => {
    await writeAgent("g1");
    await writePendingRelease("g1", "rel-g1");
    const res = await runAiReview(new NextRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "rel-g1" }),
    });
    const json = await res.json();
    expect(json.data.aiReview.status).toBe("SKIPPED");
    expect(json.data.aiReview.summary).toContain("还没有评测用例");
  });

  it("LLM 未配置 → SKIPPED", async () => {
    delete process.env.MIMO_API_KEY;
    await writeAgent("h1");
    await writePendingRelease("h1", "rel-h1");
    await writeEvalCase("h1", "case-h1");
    const res = await runAiReview(new NextRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "rel-h1" }),
    });
    const json = await res.json();
    expect(json.data.aiReview.status).toBe("SKIPPED");
    expect(json.data.aiReview.summary).toContain("MIMO_API_KEY");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("已处理的 release 再评测 → 409；release 不存在 → 404", async () => {
    await writeAgent("i1");
    await prisma.release.create({
      data: {
        id: "rel-done",
        agentId: "i1",
        changeNote: "已通过",
        changedPartitions: ["PROMPT"],
        status: "APPROVED",
        submittedBy: "tester",
        submittedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    });
    const done = await runAiReview(new NextRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "rel-done" }),
    });
    expect(done.status).toBe(409);

    const ghost = await runAiReview(new NextRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "ghost" }),
    });
    expect(ghost.status).toBe(404);
  });
});

describe("确定性断言（code-based 判分器）", () => {
  async function writePendingRelease(agentId: string, releaseId: string) {
    await prisma.release.create({
      data: {
        id: releaseId,
        agentId,
        changeNote: "收紧高危操作提示",
        changedPartitions: ["PROMPT"],
        status: "PENDING",
        submittedBy: "tester",
        submittedAt: new Date("2026-09-08T00:00:00.000Z"),
        configSnapshot: {
          prompt: { systemPrompt: "新版提示词：高危操作前提醒快照" },
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async function writeEvalCaseWithAssertions(
    agentId: string,
    caseId: string,
    assertions: unknown[],
  ) {
    await prisma.evalCase.create({
      data: {
        id: caseId,
        agentId,
        sourceTraceId: "t-x",
        title: "磁盘扩容后容量没变化",
        expectation: "必须先提醒创建快照",
        systemPrompt: "旧版提示词",
        history: [],
        message: "扩容后 df -h 没变化",
        referenceReply: "先做快照再 growpart/resize2fs",
        assertions: assertions as Prisma.InputJsonValue,
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        createdBy: "tester",
      },
    });
  }

  it("沉淀请求可携带断言并写入用例", async () => {
    await writeAgent("j1");
    const { traceId } = await chatOnce("j1", "实例无法 SSH 连接怎么排查");

    const create = await createEvalCase(
      new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          traceId,
          expectation: "给出排查步骤",
          assertions: [
            { type: "contains", value: "systemctl", description: "须给出服务检查命令" },
            { type: "not_contains", value: "无法解决" },
          ],
        }),
      }),
      { params: Promise.resolve({ id: "j1" }) },
    );
    const json = await create.json();
    expect(create.status).toBe(201);
    expect(json.data.assertions).toEqual([
      { type: "contains", value: "systemctl", description: "须给出服务检查命令" },
      { type: "not_contains", value: "无法解决" },
    ]);
  });

  it("非法断言（无效 regex / 未知 type / 空 value / 超 5 条）→ 422", async () => {
    await writeAgent("k1");
    const { traceId } = await chatOnce("k1", "问点什么");
    const bad = async (assertions: unknown[]) =>
      createEvalCase(
        new NextRequest("http://localhost", {
          method: "POST",
          body: JSON.stringify({ traceId, assertions }),
        }),
        { params: Promise.resolve({ id: "k1" }) },
      );
    expect((await bad([{ type: "regex", value: "[[[" }])).status).toBe(422);
    expect((await bad([{ type: "bogus", value: "x" }])).status).toBe(422);
    expect((await bad([{ type: "contains", value: "" }])).status).toBe(422);
    expect(
      (
        await bad(
          Array.from({ length: 6 }, (_, i) => ({ type: "contains", value: `k${i}` })),
        )
      ).status,
    ).toBe(422);
  });

  it("断言未命中 → 该用例 FAIL 且不调用判官（reason 含断言明细）", async () => {
    await writeAgent("l1");
    await writePendingRelease("l1", "rel-l1");
    await writeEvalCaseWithAssertions("l1", "case-l1", [{ type: "contains", value: "快照" }]);

    const res = await runAiReview(new NextRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "rel-l1" }),
    });
    const json = await res.json();
    const review = json.data.aiReview as {
      status: string;
      failed: number;
      results: Array<{
        verdict: string;
        score: number | null;
        reason: string;
        assertions: Array<{ type: string; value: string; passed: boolean; detail: string }>;
      }>;
    };
    expect(review.status).toBe("FAILED");
    expect(review.failed).toBe(1);
    expect(review.results[0].verdict).toBe("FAIL");
    expect(review.results[0].score).toBeNull();
    expect(review.results[0].reason).toContain("确定性断言");
    expect(review.results[0].reason).toContain("快照");
    expect(review.results[0].assertions[0].passed).toBe(false);
    // 只有 replay 一次 LLM 调用，判官零调用（省一半成本且无判官误判）
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
  });

  it("断言全过 → 走判官流程，结果携带断言明细", async () => {
    await writeAgent("m1");
    await writePendingRelease("m1", "rel-m1");
    await writeEvalCaseWithAssertions("m1", "case-m1", [{ type: "contains", value: "LLM" }]);

    const res = await runAiReview(new NextRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "rel-m1" }),
    });
    const json = await res.json();
    const review = json.data.aiReview as {
      status: string;
      results: Array<{
        verdict: string;
        assertions: Array<{ type: string; value: string; passed: boolean; detail: string }>;
      }>;
    };
    expect(review.status).toBe("PASSED");
    expect(review.results[0].verdict).toBe("PASS");
    expect(review.results[0].assertions).toEqual([
      { type: "contains", value: "LLM", passed: true, detail: expect.any(String) },
    ]);
    // replay + 判官各一次
    expect(vi.mocked(fetch).mock.calls).toHaveLength(2);
  });

  it("not_contains 与 regex 断言语义正确（全跑不短路，任一失败即 FAIL）", async () => {
    await writeAgent("n1");
    await writePendingRelease("n1", "rel-n1");
    await writeEvalCaseWithAssertions("n1", "case-n1", [
      { type: "not_contains", value: "禁词" },
      { type: "regex", value: "快照|snapshot" },
    ]);

    const res = await runAiReview(new NextRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "rel-n1" }),
    });
    const json = await res.json();
    const r0 = json.data.aiReview.results[0] as {
      verdict: string;
      reason: string;
      assertions: Array<{ passed: boolean; detail: string }>;
    };
    expect(r0.verdict).toBe("FAIL");
    expect(r0.assertions[0].passed).toBe(true);
    expect(r0.assertions[1].passed).toBe(false);
    expect(r0.reason).toContain("快照|snapshot");
  });
});
