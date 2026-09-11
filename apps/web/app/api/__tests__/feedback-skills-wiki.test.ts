import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  GET as listFeedback,
  POST as createFeedback,
  PUT as updateFeedback,
} from "@/app/api/feedback/route";
import { GET as listSkills, POST as createSkill } from "@/app/api/skills/route";
import { GET as listVaults, POST as createVault } from "@/app/api/wiki/vaults/route";
import { seedAgent } from "@/lib/__tests__/helpers/seed-db";
import { flushAudit, listAudit } from "@/lib/services/audit-service";
import { _resetDb } from "@/lib/data/test-db";

const AGENT_ID = "ecs-assistant";

function makeRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api", {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json" },
  });
}

// 批5 起存储全量在 PG：agent 需在 PG 建档，POST /api/feedback 才能通过存在性校验
beforeEach(async () => {
  await _resetDb();
  await seedAgent(AGENT_ID);
});

describe("feedback API", () => {
  it("POST creates feedback (201) + audit", async () => {
    const req = makeRequest("POST", {
      agentId: AGENT_ID,
      title: "测试",
      content: "内容",
      rating: "NEGATIVE",
      severity: "MAJOR",
    });
    const res = await createFeedback(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.status).toBe("NEW");
    await flushAudit();
    const logs = await listAudit({ action: "feedback.create" });
    expect(logs.length).toBeGreaterThan(0);
  });

  it("POST returns 404 for missing agent", async () => {
    const req = makeRequest("POST", {
      agentId: "ghost",
      title: "t",
      content: "c",
      rating: "POSITIVE",
    });
    const res = await createFeedback(req);
    expect(res.status).toBe(404);
  });

  it("POST returns 422 for invalid rating", async () => {
    const req = makeRequest("POST", {
      agentId: AGENT_ID,
      title: "t",
      content: "c",
      rating: "BOGUS",
    });
    const res = await createFeedback(req);
    expect(res.status).toBe(422);
  });

  it("PUT rejects illegal state transition (422)", async () => {
    // 先创建
    const createReq = makeRequest("POST", {
      agentId: AGENT_ID,
      title: "t",
      content: "c",
      rating: "POSITIVE",
    });
    const createRes = await createFeedback(createReq);
    const id = (await createRes.json()).data.id;

    // NEW -> RESOLVED 非法
    const req = makeRequest("PUT", { id, status: "RESOLVED" });
    const res = await updateFeedback(req);
    expect(res.status).toBe(422);
  });

  it("GET returns paginated list", async () => {
    const req = new NextRequest(
      "http://localhost/api/feedback?page=1&pageSize=10",
    );
    const res = await listFeedback(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.items).toBeInstanceOf(Array);
  });
});

describe("skills API", () => {
  it("POST creates skill (201) with migrated schema", async () => {
    const req = makeRequest("POST", {
      name: "new-skill",
      displayName: "新技能",
      description: "描述",
      category: "DATA_FETCH",
      runtime: "MCP",
    });
    const res = await createSkill(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.name).toBe("new-skill");
  });

  it("POST rejects invalid category (422)", async () => {
    const req = makeRequest("POST", {
      name: "x",
      displayName: "X",
      description: "d",
      category: "BOGUS",
    });
    const res = await createSkill(req);
    expect(res.status).toBe(422);
  });

  it("GET returns paginated list", async () => {
    const req = new NextRequest(
      "http://localhost/api/skills?page=1&pageSize=10",
    );
    const res = await listSkills(req);
    expect(res.status).toBe(200);
  });
});

describe("wiki vaults API", () => {
  it("POST creates vault (201)", async () => {
    const req = makeRequest("POST", { name: "新知识库" });
    const res = await createVault(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.name).toBe("新知识库");
  });

  it("POST rejects missing name (422)", async () => {
    const req = makeRequest("POST", {});
    const res = await createVault(req);
    expect(res.status).toBe(422);
  });

  it("POST rejects malformed gitRepoUrl (422)", async () => {
    const req = makeRequest("POST", {
      name: "v",
      gitRepoUrl: "not-a-url",
    });
    const res = await createVault(req);
    expect(res.status).toBe(422);
  });

  it("GET returns paginated list", async () => {
    const req = new NextRequest(
      "http://localhost/api/wiki/vaults?page=1&pageSize=10",
    );
    const res = await listVaults(req);
    expect(res.status).toBe(200);
  });
});
