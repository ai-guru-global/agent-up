import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@agent-up/db";
import { _resetDb } from "@/lib/data/test-db";

describe("_resetDb", () => {
  beforeEach(async () => {
    await _resetDb();
  });

  it("截断后写入 ProductGroup → Agent → Trace 并可完整读回", async () => {
    const pg = await prisma.productGroup.create({
      data: { name: "pg-test", displayName: "冒烟测试产品组" },
    });
    const agent = await prisma.agent.create({
      data: { name: "trace-smoke-agent", productGroupId: pg.id, createdBy: "test" },
    });
    const trace = await prisma.trace.create({
      data: {
        agentId: agent.id,
        systemPrompt: "你是测试助手",
        history: [{ role: "user", content: "hi" }],
        message: "hi",
        reply: "hello",
        model: "mimo-v2.5-pro",
        usage: { promptTokens: 12, completionTokens: 34, totalTokens: 46 },
        latencyMs: 42,
      },
    });

    const found = await prisma.trace.findUnique({ where: { id: trace.id } });
    expect(found).not.toBeNull();
    expect(found?.agentId).toBe(agent.id);
    expect(found?.reply).toBe("hello");
  });

  it("重复调用 _resetDb 幂等且清空数据", async () => {
    await _resetDb();
    const traces = await prisma.trace.findMany();
    expect(traces).toHaveLength(0);
  });
});
