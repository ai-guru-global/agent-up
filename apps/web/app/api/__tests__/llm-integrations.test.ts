import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { GET as probeGet, POST as probePost } from "@/app/api/maas/probe/route";
import { POST as feedbackInsight } from "@/app/api/feedback/[id]/insight/route";
import { POST as releaseSummary } from "@/app/api/releases/[id]/summary/route";
import { POST as agentChat } from "@/app/api/agents/[id]/chat/route";
import { store } from "@/lib/data/store";
import { resetActor } from "@/lib/context";
import { _resetDb } from "@/lib/data/test-db";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";

/**
 * LLM 集成点 API 测试：统一 mock global.fetch，绝不发真实请求。
 */
const LLM_REPLY = {
  model: "mimo-v2.5-pro",
  choices: [{ message: { role: "assistant", content: "LLM-MOCK-CONTENT" } }],
  usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
};

function stubLlmFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(LLM_REPLY), { status: 200 })),
  );
}

beforeEach(() => {
  resetActor();
  useTempDataDir();
  process.env.MIMO_API_KEY = "tp-test";
  stubLlmFetch();
});

afterEach(() => {
  restoreDataDir();
  vi.unstubAllGlobals();
  delete process.env.MIMO_API_KEY;
});

describe("GET/POST /api/maas/probe", () => {
  it("GET returns configured status without calling LLM", async () => {
    const res = await probeGet();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.configured).toBe(true);
    expect(json.data.model).toBe("mimo-v2.5-pro");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("POST calls LLM and returns reply + usage", async () => {
    const res = await probePost(new NextRequest("http://localhost", { method: "POST" }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.connected).toBe(true);
    expect(json.data.reply).toBe("LLM-MOCK-CONTENT");
    expect(json.data.usage.totalTokens).toBe(12);
  });
});

describe("POST /api/feedback/[id]/insight", () => {
  // 批2 起 feedback 以 Prisma 为事实源：建档走 PG（断言结构不动）
  beforeEach(async () => {
    await _resetDb();
    await prisma.productGroup.create({ data: { id: "g-a1", name: "g-a1", displayName: "A1 产品组" } });
    await prisma.agent.create({ data: { id: "a1", name: "测试助手", productGroupId: "g-a1", createdBy: "seed" } });
    await prisma.feedback.create({
      data: {
        id: "fb-1",
        agentId: "a1",
        title: "回答不准确",
        content: "ECS 重启问题答非所问",
        rating: "NEGATIVE",
        severity: "MAJOR",
        status: "NEW",
        submittedBy: "system",
        targetPartition: "PROMPT",
      },
    });
  });

  it("returns LLM insight for existing feedback", async () => {
    const res = await feedbackInsight(new NextRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "fb-1" }),
    });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.insight).toBe("LLM-MOCK-CONTENT");
    expect(json.data.feedbackId).toBe("fb-1");

    // system prompt 带四分区语境，user 消息带反馈内容
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.messages[0].content).toContain("归因分析");
    expect(body.messages[1].content).toContain("ECS 重启问题答非所问");
  });

  it("returns 404 for missing feedback", async () => {
    const res = await feedbackInsight(new NextRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "ghost" }),
    });
    expect(res.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("POST /api/releases/[id]/summary", () => {
  it("returns LLM summary built from snapshot diff", async () => {
    store.write(
      {
        id: "rel-1",
        agentId: "a1",
        changeNote: "收紧价格类回答",
        status: "PENDING",
        configSnapshot: { prompt: { systemPrompt: "新版提示词" } },
        submittedAt: "2026-08-20T00:00:00.000Z",
      },
      "releases",
      "rel-1.json",
    );
    const res = await releaseSummary(new NextRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "rel-1" }),
    });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.summary).toBe("LLM-MOCK-CONTENT");

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.messages[1].content).toContain("收紧价格类回答");
    expect(body.messages[1].content).toContain("新版提示词");
  });

  it("returns 404 for missing release", async () => {
    const res = await releaseSummary(new NextRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "ghost" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/agents/[id]/chat", () => {
  beforeEach(() => {
    store.write(
      {
        id: "a1",
        name: "测试助手",
        status: "ACTIVE",
        promptConfig: {
          systemPrompt: "你是 ECS 助手",
          roleDefinition: null,
          constraints: ["不回答无关问题"],
          outputFormat: null,
        },
      },
      "agents",
      "a1.json",
    );
  });

  it("uses agent prompt config as system prompt and returns reply", async () => {
    const res = await agentChat(
      new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({ message: "实例挂了怎么办", history: [] }),
      }),
      { params: Promise.resolve({ id: "a1" }) },
    );
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.reply).toBe("LLM-MOCK-CONTENT");

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.messages[0].content).toContain("你是 ECS 助手");
    expect(body.messages[0].content).toContain("不回答无关问题");
    expect(body.messages[1]).toEqual({ role: "user", content: "实例挂了怎么办" });
  });

  it("returns 422 for invalid body", async () => {
    const res = await agentChat(
      new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({ message: "" }),
      }),
      { params: Promise.resolve({ id: "a1" }) },
    );
    expect(res.status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown agent", async () => {
    const res = await agentChat(
      new NextRequest("http://localhost", {
        method: "POST",
        body: JSON.stringify({ message: "hi" }),
      }),
      { params: Promise.resolve({ id: "ghost" }) },
    );
    expect(res.status).toBe(404);
  });
});
