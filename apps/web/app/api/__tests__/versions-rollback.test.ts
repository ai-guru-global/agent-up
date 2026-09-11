import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { GET as getVersions } from "@/app/api/agents/[id]/versions/route";
import { POST as rollback } from "@/app/api/agents/[id]/config/[partition]/rollback/route";
import { GET as getConfig } from "@/app/api/agents/[id]/config/[partition]/route";
import { resetActor } from "@/lib/context";
import { _resetDb } from "@/lib/data/test-db";
import { seedAgent, seedReleaseWithVersion } from "@/lib/__tests__/helpers/seed-db";
import { flushAudit, listAudit } from "@/lib/services/audit-service";

const AGENT_ID = "ecs-assistant";

function makeRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api", {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json" },
  });
}

// 批4 起版本事实源在 PG：夹具用 seedReleaseWithVersion 自控快照内容
// （不带 wikiVaultId，无需 vault 前置种子；PG AgentVersion 的快照列是 Json，不做 FK 校验）
beforeEach(async () => {
  resetActor();
  await _resetDb();
  await seedAgent(AGENT_ID);
  await seedAgent("rds-assistant", "RDS 助手");
  await seedReleaseWithVersion({
    agentId: AGENT_ID,
    versionId: "ver-001",
    version: "0.1.0",
    changeNote: "初始发布",
    snapshots: {
      prompt: { systemPrompt: "你是一个专业的 ECS 助手（v1）", constraints: ["不执行变更"] },
      knowledge: { searchStrategy: "WIKI_FIRST", maxWikiResults: 3 },
      tools: { mcpTools: [], wikiQueryTools: [], maxConcurrentCalls: 3 },
      routing: { rules: [], humanThreshold: 0.3 },
    },
  });
  await seedReleaseWithVersion({
    agentId: AGENT_ID,
    versionId: "ver-002",
    version: "0.2.0",
    changeNote: "安全组知识优化",
    snapshots: {
      prompt: { systemPrompt: "你是一个专业的 ECS 助手（v2）" },
      knowledge: { searchStrategy: "WIKI_FIRST", maxWikiResults: 5 },
    },
  });
  await seedReleaseWithVersion({
    agentId: "rds-assistant",
    versionId: "ver-rds-001",
    version: "0.1.0",
    changeNote: "RDS 初始发布",
  });
});
afterEach(async () => {
  await flushAudit();
});

describe("GET /api/agents/[id]/versions", () => {
  it("returns version history for seed agent", async () => {
    const res = await getVersions(
      new NextRequest("http://localhost"),
      { params: Promise.resolve({ id: AGENT_ID }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.items.length).toBe(2); // ver-001 + ver-002
    // 倒序：最新的在前
    expect(json.data.items[0].version).toBe("0.2.0");
    expect(json.data.items[1].version).toBe("0.1.0");
  });

  it("each version has 4 partition snapshots", async () => {
    const res = await getVersions(
      new NextRequest("http://localhost"),
      { params: Promise.resolve({ id: AGENT_ID }) },
    );
    const json = await res.json();
    const v = json.data.items[0];
    expect(v).toHaveProperty("promptSnapshot");
    expect(v).toHaveProperty("knowledgeSnapshot");
    expect(v).toHaveProperty("toolsSnapshot");
    expect(v).toHaveProperty("routingSnapshot");
  });

  it("returns single version for rds agent", async () => {
    const res = await getVersions(
      new NextRequest("http://localhost"),
      { params: Promise.resolve({ id: "rds-assistant" }) },
    );
    const json = await res.json();
    expect(json.data.items.length).toBe(1);
  });

  it("returns empty for missing agent", async () => {
    const res = await getVersions(
      new NextRequest("http://localhost"),
      { params: Promise.resolve({ id: "ghost" }) },
    );
    const json = await res.json();
    expect(json.data.items).toEqual([]);
    expect(json.data.total).toBe(0);
  });
});

describe("POST /api/agents/[id]/config/[partition]/rollback", () => {
  it("rolls back prompt partition to ver-001", async () => {
    const res = await rollback(
      makeRequest("POST", { versionId: "ver-001" }),
      { params: Promise.resolve({ id: AGENT_ID, partition: "prompt" }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.partition).toBe("prompt");
    expect(json.data.restoredFromVersion).toBe("0.1.0");

    // 验证配置确实变了
    const afterRes = await getConfig(
      new NextRequest("http://localhost"),
      { params: Promise.resolve({ id: AGENT_ID, partition: "prompt" }) },
    );
    const after = (await afterRes.json()).data;
    expect(after.systemPrompt).toBeDefined();
    expect(after.systemPrompt).toContain("你是一个专业的 ECS 助手（v1）");
  });

  it("writes a config-change record with ROLLBACK label", async () => {
    await rollback(
      makeRequest("POST", { versionId: "ver-001" }),
      { params: Promise.resolve({ id: AGENT_ID, partition: "knowledge" }) },
    );
    // 批3 起 config-changes 落 PG
    const change = await prisma.configChange.findFirst({
      where: { agentId: AGENT_ID, partition: { contains: "ROLLBACK" } },
    });
    expect(change).toBeTruthy();
    expect(change?.changeNote).toMatch(/回滚/);
  });

  it("returns 404 for missing version", async () => {
    const res = await rollback(
      makeRequest("POST", { versionId: "ghost-version" }),
      { params: Promise.resolve({ id: AGENT_ID, partition: "prompt" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 when version belongs to different agent", async () => {
    const res = await rollback(
      makeRequest("POST", { versionId: "ver-rds-001" }),
      { params: Promise.resolve({ id: AGENT_ID, partition: "prompt" }) },
    );
    expect(res.status).toBe(422);
  });

  it("returns 400 for invalid partition", async () => {
    const res = await rollback(
      makeRequest("POST", { versionId: "ver-001" }),
      { params: Promise.resolve({ id: AGENT_ID, partition: "bogus" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 for missing versionId in body", async () => {
    const res = await rollback(
      makeRequest("POST", {}),
      { params: Promise.resolve({ id: AGENT_ID, partition: "prompt" }) },
    );
    expect(res.status).toBe(422);
  });

  it("writes audit log on rollback", async () => {
    await rollback(
      makeRequest("POST", { versionId: "ver-001" }),
      { params: Promise.resolve({ id: AGENT_ID, partition: "tools" }) },
    );
    await flushAudit();
    const logs = await listAudit();
    expect(
      logs.some((l) => l.action === "agent.config.update"),
    ).toBe(true);
  });
});
