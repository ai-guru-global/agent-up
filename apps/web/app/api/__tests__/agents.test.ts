import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { GET as listAgents, POST as createAgent } from "@/app/api/agents/route";
import {
  GET as getAgent,
  PUT as updateAgent,
  DELETE as deleteAgent,
} from "@/app/api/agents/[id]/route";
import {
  GET as getConfig,
  PUT as updateConfig,
} from "@/app/api/agents/[id]/config/[partition]/route";
import { resetActor } from "@/lib/context";
import { _resetDb } from "@/lib/data/test-db";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";
import { flushAudit, listAudit } from "@/lib/services/audit-service";

const AGENT_ID = "ecs-assistant";

function makeRequest(
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest("http://localhost/api", {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

beforeEach(async () => {
  resetActor();
  useTempDataDir();
  await _resetDb();
  await prisma.productGroup.create({
    data: { id: "ecs-group", name: "ecs-group", displayName: "ECS 产品组" },
  });
  await prisma.agent.create({
    data: { id: AGENT_ID, name: "ECS 助手", productGroupId: "ecs-group", createdBy: "seed" },
  });
  await prisma.agent.create({
    data: { id: "rds-assistant", name: "RDS 助手", productGroupId: "ecs-group", createdBy: "seed" },
  });
  await prisma.promptConfig.create({
    data: { agentId: AGENT_ID, systemPrompt: "你是 ECS 助手", constraints: [] },
  });
});
afterEach(restoreDataDir);

describe("GET /api/agents", () => {
  it("returns paginated list", async () => {
    const req = new NextRequest("http://localhost/api/agents?page=1&pageSize=10");
    const res = await listAgents(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.items.length).toBeGreaterThan(0);
    expect(json.data.pagination).toBeDefined();
    // 列表项带真实计数与产品组摘要
    expect(json.data.items[0]._count).toHaveProperty("feedbacks");
    expect(json.data.items[0].productGroup).toMatchObject({ id: "ecs-group" });
  });

  it("filters by status", async () => {
    await prisma.agent.update({
      where: { id: AGENT_ID },
      data: { status: "ACTIVE" },
    });
    const req = new NextRequest(
      "http://localhost/api/agents?status=ACTIVE",
    );
    const res = await listAgents(req);
    const json = await res.json();
    expect(json.data.items.every((a: { status: string }) => a.status === "ACTIVE")).toBe(true);
    expect(json.data.items.length).toBe(1);
  });
});

describe("POST /api/agents", () => {
  it("creates an agent (201)", async () => {
    const req = makeRequest("POST", {
      name: "新 Agent",
      productGroupId: "ecs-group",
    });
    const res = await createAgent(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.name).toBe("新 Agent");
    expect(json.data.status).toBe("DRAFT");
    expect(json.data._count).toEqual({
      feedbacks: 0,
      releases: 0,
      versions: 0,
      skillBindings: 0,
    });
    // 审计
    await flushAudit();
    const logs = await listAudit({ action: "agent.create" });
    expect(logs.some((l) => l.resourceId === json.data.id)).toBe(true);
  });

  it("returns 404 for missing product group", async () => {
    const req = makeRequest("POST", {
      name: "X",
      productGroupId: "ghost-group",
    });
    const res = await createAgent(req);
    expect(res.status).toBe(404);
  });

  it("returns 422 for empty name", async () => {
    const req = makeRequest("POST", { name: "", productGroupId: "ecs-group" });
    const res = await createAgent(req);
    expect(res.status).toBe(422);
  });
});

describe("GET /api/agents/[id]", () => {
  it("returns 200 for existing agent", async () => {
    const res = await getAgent(
      new NextRequest("http://localhost"),
      { params: Promise.resolve({ id: AGENT_ID }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.productGroup).toMatchObject({ id: "ecs-group" });
  });

  it("returns 404 for missing agent", async () => {
    const res = await getAgent(
      new NextRequest("http://localhost"),
      { params: Promise.resolve({ id: "ghost" }) },
    );
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/agents/[id]", () => {
  it("updates name", async () => {
    const req = makeRequest("PUT", { name: "改名后" });
    const res = await updateAgent(req, {
      params: Promise.resolve({ id: AGENT_ID }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.name).toBe("改名后");
  });

  it("returns 404 for missing agent", async () => {
    const req = makeRequest("PUT", { name: "x" });
    const res = await updateAgent(req, {
      params: Promise.resolve({ id: "ghost" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/agents/[id]", () => {
  it("archives agent", async () => {
    const res = await deleteAgent(
      new NextRequest("http://localhost"),
      { params: Promise.resolve({ id: AGENT_ID }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.message).toMatch(/归档/);
  });
});

describe("config partition routes", () => {
  it("GET returns prompt config", async () => {
    const res = await getConfig(
      new NextRequest("http://localhost"),
      { params: Promise.resolve({ id: AGENT_ID, partition: "prompt" }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveProperty("systemPrompt");
    expect(json.data).toHaveProperty("version");
  });

  it("GET rejects invalid partition (400)", async () => {
    const res = await getConfig(
      new NextRequest("http://localhost"),
      { params: Promise.resolve({ id: AGENT_ID, partition: "bogus" }) },
    );
    expect(res.status).toBe(400);
  });

  it("PUT updates prompt config + bumps version + writes config-change", async () => {
    const req = makeRequest("PUT", {
      systemPrompt: "更新的提示词",
      roleDefinition: "r",
      constraints: ["c1"],
      outputFormat: "Markdown",
    });
    const res = await updateConfig(req, {
      params: Promise.resolve({ id: AGENT_ID, partition: "prompt" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Number(json.data.version)).toBe(2); // 种子 version 1 + 1

    // config-change 落 PG
    const change = await prisma.configChange.findFirst({
      where: { agentId: AGENT_ID },
    });
    expect(change).toBeTruthy();
    expect(change?.partition).toBe("PROMPT");
  });
});
