import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getUsage } from "@/app/api/maas/usage/route";
import { store } from "@/lib/data/store";
import { resetActor } from "@/lib/context";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";

/**
 * GET /api/maas/usage — 每 Agent 真实模型用量（聚合试聊 trace）。
 * 语义：调用次数 / tokens / 平均时延 / 👍👎 比例；有数据 hasData=true，
 * 无数据 hasData=false（由页面回退 MOCK 演示口径并声明「尚无试聊数据」）。
 * 不涉及 LLM 调用。
 */

interface SeededTrace {
  id: string;
  agentId: string;
  message: string;
  reply: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
  createdAt: string;
  rating: "UP" | "DOWN" | null;
  ratedAt: string | null;
  note: string | null;
}

function seedTrace(t: Partial<SeededTrace> & { id: string; agentId: string }) {
  const trace: SeededTrace = {
    id: t.id,
    agentId: t.agentId,
    message: t.message ?? "m",
    reply: t.reply ?? "r",
    model: t.model ?? "mimo-v2.5-pro",
    usage: t.usage ?? { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    latencyMs: t.latencyMs ?? 1000,
    createdAt: t.createdAt ?? "2026-09-09T00:00:00.000Z",
    rating: t.rating ?? null,
    ratedAt: t.ratedAt ?? null,
    note: t.note ?? null,
  };
  store.write(trace, "traces", `${trace.id}.json`);
}

function writeAgent(id: string, name: string) {
  store.write({ id, name, status: "ACTIVE" }, "agents", `${id}.json`);
}

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/maas/usage", { method: "GET" });
}

/** useTempDataDir 会拷贝运行时 data/（可能含历史 trace），测试前清空保证确定性 */
function clearTraces() {
  for (const t of store.list<{ id: string }>("traces")) {
    store.delete("traces", `${t.id}.json`);
  }
}

beforeEach(() => {
  resetActor();
  useTempDataDir();
  clearTraces();
});

afterEach(() => {
  restoreDataDir();
});

describe("GET /api/maas/usage（每 Agent 真实用量聚合）", () => {
  it("空 trace → hasData=false，agents 为空数组", async () => {
    const res = await getUsage(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.hasData).toBe(false);
    expect(json.data.agents).toEqual([]);
  });

  it("按 agent 聚合调用次数 / tokens / 平均时延 / 评分计数，按调用次数降序", async () => {
    writeAgent("agent-a", "助手 A");
    writeAgent("agent-b", "助手 B");

    // agent-a：3 次调用（UP 1 / DOWN 1 / 未打分 1），latency 1000+2000+3000 → avg 2000
    seedTrace({ id: "t-a1", agentId: "agent-a", rating: "UP", latencyMs: 1000 });
    seedTrace({ id: "t-a2", agentId: "agent-a", rating: "DOWN", latencyMs: 2000 });
    seedTrace({ id: "t-a3", agentId: "agent-a", latencyMs: 3000 });
    // agent-b：1 次调用
    seedTrace({
      id: "t-b1",
      agentId: "agent-b",
      latencyMs: 800,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      model: "mimo-v2.5-flash",
    });

    const res = await getUsage(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    const data = json.data as {
      hasData: boolean;
      computedAt: string;
      agents: Array<{
        agentId: string;
        agentName: string | null;
        model: string | null;
        calls: number;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        avgLatencyMs: number;
        ratingsUp: number;
        ratingsDown: number;
        unrated: number;
        lastCallAt: string | null;
      }>;
    };

    expect(data.hasData).toBe(true);
    expect(data.agents).toHaveLength(2);
    // 调用次数降序：agent-a(3) 在前
    expect(data.agents[0].agentId).toBe("agent-a");
    expect(data.agents[1].agentId).toBe("agent-b");

    const a = data.agents[0];
    expect(a.agentName).toBe("助手 A");
    expect(a.calls).toBe(3);
    expect(a.promptTokens).toBe(300);
    expect(a.completionTokens).toBe(150);
    expect(a.totalTokens).toBe(450);
    expect(a.avgLatencyMs).toBe(2000);
    expect(a.ratingsUp).toBe(1);
    expect(a.ratingsDown).toBe(1);
    expect(a.unrated).toBe(1);
    expect(a.lastCallAt).toBe("2026-09-09T00:00:00.000Z");

    const b = data.agents[1];
    expect(b.calls).toBe(1);
    expect(b.totalTokens).toBe(30);
    expect(b.avgLatencyMs).toBe(800);
    expect(b.model).toBe("mimo-v2.5-flash");
  });

  it("model 取最近一次调用（createdAt 最大）的模型；agent 不存在时 agentName=null", async () => {
    seedTrace({
      id: "t-old",
      agentId: "agent-x",
      model: "old-model",
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    seedTrace({
      id: "t-new",
      agentId: "agent-x",
      model: "new-model",
      createdAt: "2026-09-08T00:00:00.000Z",
    });

    const res = await getUsage(makeRequest());
    const json = await res.json();
    const [only] = json.data.agents as Array<{
      agentId: string;
      agentName: string | null;
      model: string | null;
    }>;
    expect(only.agentId).toBe("agent-x");
    expect(only.model).toBe("new-model");
    expect(only.agentName).toBeNull();
  });
});
