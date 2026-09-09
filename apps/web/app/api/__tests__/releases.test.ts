import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as submitRelease, PUT as reviewReleaseLegacy } from "@/app/api/agents/[id]/release/route";
import { PUT as reviewRelease } from "@/app/api/releases/[id]/review/route";
import { GET as listReleases } from "@/app/api/releases/route";
import { GET as getRelease } from "@/app/api/releases/[id]/route";
import { store, _getDataDir } from "@/lib/data/store";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";
import { rmSync, mkdirSync } from "fs";
import { join } from "path";

const AGENT_ID = "ecs-assistant";

function makeRequest(
  method: string,
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest("http://localhost/api", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

beforeEach(() => {
  useTempDataDir();
  // 清空 versions，让 release 流程从干净状态开始
  const versionsDir = join(_getDataDir(), "versions");
  rmSync(versionsDir, { recursive: true, force: true });
  mkdirSync(versionsDir, { recursive: true });
});
afterEach(restoreDataDir);

describe("POST /api/agents/[id]/release", () => {
  it("submits a release (201) with actor + audit", async () => {
    const req = makeRequest(
      "POST",
      { changeNote: "首次发布" },
      { "x-actor-id": "user-1", "x-actor-name": "tester", "x-actor-role": "product_member" },
    );
    const res = await submitRelease(req, {
      params: Promise.resolve({ id: AGENT_ID }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("PENDING");
    expect(json.data.submittedBy).toBe("user-1"); // 从 x-actor-id 解析

    // 审计写入
    const logs = store.readArray<Record<string, unknown>>("settings", "audit-logs.json");
    expect(logs.some((l) => l.action === "release.submit")).toBe(true);
  });

  it("returns 422 for empty changeNote", async () => {
    const req = makeRequest("POST", { changeNote: "" });
    const res = await submitRelease(req, {
      params: Promise.resolve({ id: AGENT_ID }),
    });
    expect(res.status).toBe(422);
  });

  it("returns 404 for missing agent", async () => {
    const req = makeRequest("POST", { changeNote: "x" });
    const res = await submitRelease(req, {
      params: Promise.resolve({ id: "ghost" }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.code).toBe("NOT_FOUND");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await submitRelease(req, {
      params: Promise.resolve({ id: AGENT_ID }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/releases/[id]/review", () => {
  async function seedPendingRelease(): Promise<string> {
    const req = makeRequest("POST", { changeNote: "待审批" });
    const res = await submitRelease(req, {
      params: Promise.resolve({ id: AGENT_ID }),
    });
    const json = await res.json();
    return json.data.id;
  }

  it("APPROVED (200) creates a version", async () => {
    const id = await seedPendingRelease();
    const req = makeRequest("PUT", {
      releaseId: id,
      action: "APPROVED",
      reviewComment: "通过",
    });
    const res = await reviewRelease(req, { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("APPROVED");
    expect(json.data.version).toBeTruthy();
    // 审计
    const logs = store.readArray<Record<string, unknown>>("settings", "audit-logs.json");
    expect(logs.some((l) => l.action === "release.approve")).toBe(true);
  });

  it("REJECTED does not create a version", async () => {
    const id = await seedPendingRelease();
    const req = makeRequest("PUT", {
      releaseId: id,
      action: "REJECTED",
      reviewComment: "不通过",
    });
    const res = await reviewRelease(req, { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("REJECTED");
    expect(json.data.version).toBeNull();
  });

  it("re-review returns 409 ConflictError", async () => {
    const id = await seedPendingRelease();
    const req1 = makeRequest("PUT", {
      releaseId: id,
      action: "APPROVED",
    });
    await reviewRelease(req1, { params: Promise.resolve({ id }) });
    const req2 = makeRequest("PUT", {
      releaseId: id,
      action: "APPROVED",
    });
    const res = await reviewRelease(req2, { params: Promise.resolve({ id }) });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe("CONFLICT");
  });

  it("CHANGES_REQUESTED without comment returns 422", async () => {
    const id = await seedPendingRelease();
    const req = makeRequest("PUT", {
      releaseId: id,
      action: "CHANGES_REQUESTED",
    });
    const res = await reviewRelease(req, { params: Promise.resolve({ id }) });
    expect(res.status).toBe(422);
  });
});

describe("发布门禁：AI 评测 FAILED 后批准须留痕（软门禁）", () => {
  const failedReview = {
    status: "FAILED",
    runAt: "2026-09-08T00:00:00.000Z",
    model: "mimo-v2.5-pro",
    totalCases: 2,
    passed: 1,
    failed: 1,
    errorCases: 0,
    summary: "1 个用例未达标，建议驳回或要求修改后重测",
    results: [],
  };

  function seedPendingWithReview(
    releaseId: string,
    aiReview: Record<string, unknown> | null,
  ) {
    store.write(
      {
        id: releaseId,
        agentId: AGENT_ID,
        changeNote: "带评测结论的提交",
        changedPartitions: ["PROMPT"],
        status: "PENDING",
        submittedBy: "tester",
        submittedAt: "2026-09-01T00:00:00.000Z",
        approvedBy: null,
        approvedAt: null,
        reviewComment: null,
        configSnapshot: {
          prompt: { systemPrompt: "带门禁测试的提示词" },
          knowledge: null,
          tools: null,
          routing: null,
          snapshotAt: "2026-09-01T00:00:00.000Z",
        },
        version: null,
        ...(aiReview ? { aiReview } : {}),
      },
      "releases",
      `${releaseId}.json`,
    );
  }

  it("FAILED + 无意见 APPROVED → 422，release 保持 PENDING", async () => {
    seedPendingWithReview("rel-gate1", failedReview);
    const res = await reviewRelease(
      makeRequest("PUT", { releaseId: "rel-gate1", action: "APPROVED" }),
      { params: Promise.resolve({ id: "rel-gate1" }) },
    );
    expect(res.status).toBe(422);
    expect(
      store.read<{ status?: string }>("releases", "rel-gate1.json")?.status,
    ).toBe("PENDING");
  });

  it("FAILED + 有意见 APPROVED → 200，审计含 aiReviewStatus=FAILED", async () => {
    seedPendingWithReview("rel-gate2", failedReview);
    const res = await reviewRelease(
      makeRequest("PUT", {
        releaseId: "rel-gate2",
        action: "APPROVED",
        reviewComment: "已人工复核，FAIL 用例为判官误判，接受发布",
      }),
      { params: Promise.resolve({ id: "rel-gate2" }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("APPROVED");
    expect(json.data.version).toBeTruthy();
    const logs = store.readArray<Record<string, unknown>>("settings", "audit-logs.json");
    const approve = logs.find(
      (l) => l.action === "release.approve" && l.resourceId === "rel-gate2",
    );
    expect(approve).toBeTruthy();
    expect((approve?.details as { aiReviewStatus?: string })?.aiReviewStatus).toBe(
      "FAILED",
    );
  });

  it("PASSED + 无意见 APPROVED → 200（门禁不触发）", async () => {
    seedPendingWithReview("rel-gate3", {
      ...failedReview,
      status: "PASSED",
      passed: 2,
      failed: 0,
      summary: "全部 2 个用例通过，建议批准发布",
    });
    const res = await reviewRelease(
      makeRequest("PUT", { releaseId: "rel-gate3", action: "APPROVED" }),
      { params: Promise.resolve({ id: "rel-gate3" }) },
    );
    expect(res.status).toBe(200);
  });

  it("无 aiReview + 无意见 APPROVED → 200（存量行为不变）", async () => {
    seedPendingWithReview("rel-gate4", null);
    const res = await reviewRelease(
      makeRequest("PUT", { releaseId: "rel-gate4", action: "APPROVED" }),
      { params: Promise.resolve({ id: "rel-gate4" }) },
    );
    expect(res.status).toBe(200);
  });
});

describe("legacy PUT /api/agents/[id]/release (backward compat)", () => {
  it("still works via the deprecated endpoint", async () => {
    // 先提交
    const submitReq = makeRequest("POST", { changeNote: "legacy" });
    const submitRes = await submitRelease(submitReq, {
      params: Promise.resolve({ id: AGENT_ID }),
    });
    const releaseId = (await submitRes.json()).data.id;

    // 用旧端点审批
    const req = makeRequest("PUT", {
      releaseId,
      action: "APPROVED",
    });
    const res = await reviewReleaseLegacy(req, {
      params: Promise.resolve({ id: AGENT_ID }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("APPROVED");
  });
});

describe("GET /api/releases", () => {
  it("returns paginated list with agent names joined", async () => {
    const req = new NextRequest(
      "http://localhost/api/releases?page=1&pageSize=10",
    );
    const res = await listReleases(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.items).toBeInstanceOf(Array);
    expect(json.data.pagination).toBeDefined();
  });
});

describe("GET /api/releases/[id] (single release + diff baseline)", () => {
  it("returns 404 for missing release", async () => {
    const res = await getRelease(
      new NextRequest("http://localhost"),
      { params: Promise.resolve({ id: "ghost" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns release with configSnapshot + baseline for seed release", async () => {
    const res = await getRelease(
      new NextRequest("http://localhost"),
      { params: Promise.resolve({ id: "rel-002" }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe("rel-002");
    expect(json.data.agent).toBeTruthy();
    expect(json.data.baseline).toBeDefined();
    // baseline 应有四个分区字段
    expect(json.data.baseline).toHaveProperty("prompt");
    expect(json.data.baseline).toHaveProperty("knowledge");
  });

  it("returns configSnapshot for a newly submitted release", async () => {
    // 提交一个新 release（versions 已清空，所以会有变更）
    const submitReq = makeRequest("POST", { changeNote: "for snapshot test" });
    const submitRes = await submitRelease(submitReq, {
      params: Promise.resolve({ id: AGENT_ID }),
    });
    const releaseId = (await submitRes.json()).data.id;

    const res = await getRelease(
      new NextRequest("http://localhost"),
      { params: Promise.resolve({ id: releaseId }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.configSnapshot).toBeTruthy();
    expect(json.data.configSnapshot).toHaveProperty("prompt");
  });
});
