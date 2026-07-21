import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
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
import { store } from "@/lib/data/store";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";

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

beforeEach(useTempDataDir);
afterEach(restoreDataDir);

describe("GET /api/agents", () => {
  it("returns paginated list", async () => {
    const req = new NextRequest("http://localhost/api/agents?page=1&pageSize=10");
    const res = await listAgents(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.items.length).toBeGreaterThan(0);
    expect(json.data.pagination).toBeDefined();
  });

  it("filters by status", async () => {
    const req = new NextRequest(
      "http://localhost/api/agents?status=ACTIVE",
    );
    const res = await listAgents(req);
    const json = await res.json();
    expect(json.data.items.every((a: { status: string }) => a.status === "ACTIVE")).toBe(true);
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
    // 审计
    const logs = store.readArray<Record<string, unknown>>("settings", "audit-logs.json");
    expect(logs.some((l) => l.action === "agent.create")).toBe(true);
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
    expect(Number(json.data.version)).toBeGreaterThan(0);

    // config-change 写入
    const changes = store.list<Record<string, unknown>>("config-changes");
    expect(changes.some((c) => c.agentId === AGENT_ID)).toBe(true);
  });
});
