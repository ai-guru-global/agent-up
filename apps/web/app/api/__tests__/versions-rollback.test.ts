import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getVersions } from "@/app/api/agents/[id]/versions/route";
import { POST as rollback } from "@/app/api/agents/[id]/config/[partition]/rollback/route";
import { GET as getConfig } from "@/app/api/agents/[id]/config/[partition]/route";
import { store } from "@/lib/data/store";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";

const AGENT_ID = "ecs-assistant";

function makeRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api", {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(useTempDataDir);
afterEach(restoreDataDir);

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

  it("returns empty for agent with no versions", async () => {
    const res = await getVersions(
      new NextRequest("http://localhost"),
      { params: Promise.resolve({ id: "rds-assistant" }) },
    );
    // rds has ver-rds-001 in seed
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
    // 先记录当前 prompt 的值
    const beforeRes = await getConfig(
      new NextRequest("http://localhost"),
      { params: Promise.resolve({ id: AGENT_ID, partition: "prompt" }) },
    );
    const before = (await beforeRes.json()).data;

    // 回滚到 ver-001（初始版本，promptConfig 可能不同）
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
  });

  it("writes a config-change record with ROLLBACK label", async () => {
    await rollback(
      makeRequest("POST", { versionId: "ver-001" }),
      { params: Promise.resolve({ id: AGENT_ID, partition: "knowledge" }) },
    );
    const changes = store.list<Record<string, unknown>>("config-changes");
    const rollbackChange = changes.find((c) =>
      String(c.partition).includes("ROLLBACK"),
    );
    expect(rollbackChange).toBeTruthy();
    expect(rollbackChange!.changeNote).toMatch(/回滚/);
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
    const logs = store.readArray<Record<string, unknown>>(
      "settings",
      "audit-logs.json",
    );
    expect(
      logs.some((l) => l.action === "agent.config.update"),
    ).toBe(true);
  });
});
