import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma, Prisma } from "@agent-up/db";
import { GET as getEvidenceChain } from "@/app/api/agents/[id]/evidence-chain/route";
import { resetActor } from "@/lib/context";
import { _resetDb } from "@/lib/data/test-db";
import { seedAgent, seedReleaseWithVersion } from "@/lib/__tests__/helpers/seed-db";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";

/**
 * GET /api/agents/[id]/evidence-chain — 任务证据链（只读聚合，无新存储）。
 * 节点：反馈 → 试聊 trace（打分/已沉淀用例）→ Release（AI 评测结论）→
 * Version（效果报告）→ 回滚记录；按时间倒序。
 * 响应固定携带诚实声明：「证据链呈现记录到的关联，非因果改进证明」。
 */

type Node = {
  type: string;
  id: string;
  at: string;
  title: string;
  status: string | null;
  detail: Record<string, unknown> | null;
};

function makeChain(id: string) {
  return getEvidenceChain(
    new NextRequest(`http://localhost/api/agents/${id}/evidence-chain`, { method: "GET" }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(async () => {
  resetActor();
  useTempDataDir();
  await _resetDb();
});

afterEach(() => {
  restoreDataDir();
});

describe("GET /api/agents/[id]/evidence-chain（任务证据链）", () => {
  it("agent 不存在 → 404", async () => {
    const res = await makeChain("no-such-agent");
    expect(res.status).toBe(404);
  });

  it("agent 存在但无任何关联数据 → nodes 为空数组，声明仍在", async () => {
    await seedAgent("agent-empty", "空助手");
    const res = await makeChain("agent-empty");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.nodes).toEqual([]);
    expect(String(json.data.declaration)).toContain("非因果改进证明");
  });

  it("五类节点按时间倒序聚合；trace 关联已沉淀用例；isRollback release 不重复出 RELEASE 节点", async () => {
    await seedAgent("agent-x", "证据助手");

    // 反馈（09-01）
    await prisma.feedback.create({
      data: {
        id: "fb-x1",
        agentId: "agent-x",
        title: "安全组说明不清",
        content: "内容",
        rating: "NEGATIVE",
        severity: "MAJOR",
        status: "NEW",
        targetPartition: "KNOWLEDGE",
        submittedBy: "cre-zhang",
        submittedAt: new Date("2026-09-01T09:00:00.000Z"),
      },
    });

    // 试聊 trace（09-02）+ 已沉淀用例
    await prisma.trace.create({
      data: {
        id: "tr-x1",
        agentId: "agent-x",
        systemPrompt: "s",
        history: [] as Prisma.InputJsonValue,
        message: "SSH 连不上怎么排查",
        reply: "r",
        model: "mimo-v2.5-pro",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 } as Prisma.InputJsonValue,
        latencyMs: 900,
        createdAt: new Date("2026-09-02T10:00:00.000Z"),
        rating: "DOWN",
        ratedAt: new Date("2026-09-02T10:01:00.000Z"),
        note: "第一步没提安全组",
      },
    });
    await prisma.evalCase.create({
      data: {
        id: "ec-x1",
        agentId: "agent-x",
        sourceTraceId: "tr-x1",
        title: "SSH 排查",
        expectation: "应给出排查步骤",
        systemPrompt: "s",
        history: [] as Prisma.InputJsonValue,
        message: "SSH 连不上怎么排查",
        referenceReply: "r",
        createdBy: "cre-zhang",
      },
    });

    // Release（09-03，AI 评测 FAILED）+ 一条 isRollback 的回滚 release（不应出 RELEASE 节点）
    await prisma.release.create({
      data: {
        id: "rel-x1",
        agentId: "agent-x",
        changeNote: "补风险提示",
        changedPartitions: ["PROMPT"],
        status: "PENDING",
        submittedBy: "pm-chen",
        submittedAt: new Date("2026-09-03T09:00:00.000Z"),
        aiReview: { status: "FAILED", computedAt: "2026-09-03T09:05:00.000Z" } as Prisma.InputJsonValue,
      },
    });
    await prisma.release.create({
      data: {
        id: "rel-rb",
        agentId: "agent-x",
        changeNote: "回滚到 Version 0.1.0",
        changedPartitions: ["PROMPT"],
        status: "APPROVED",
        submittedBy: "pm-chen",
        submittedAt: new Date("2026-09-06T09:00:00.000Z"),
        isRollback: true,
      },
    });

    // Version（09-04，含效果报告）
    await seedReleaseWithVersion({
      agentId: "agent-x",
      versionId: "ver-x1",
      version: "0.2.0",
      publishedAt: new Date("2026-09-04T09:00:00.000Z"),
    });
    await prisma.agentVersion.update({
      where: { id: "ver-x1" },
      data: { effectivenessReport: { totalFeedbacks: 2 } as Prisma.InputJsonValue },
    });

    // 回滚审计（09-05，整版本回滚）
    await prisma.auditLog.create({
      data: {
        id: "log-rb1",
        action: "agent.rollback",
        resource: "agent",
        resourceId: "agent-x",
        userName: "admin-zhao",
        userRole: "platform_admin",
        createdAt: new Date("2026-09-05T09:00:00.000Z"),
        details: { rollbackFromVersion: "0.1.0", newVersion: "0.3.0" } as Prisma.InputJsonValue,
      },
    });

    const res = await makeChain("agent-x");
    expect(res.status).toBe(200);
    const json = await res.json();
    const data = json.data as {
      agentId: string;
      agentName: string | null;
      nodes: Node[];
      computedAt: string;
      declaration: string;
    };

    expect(data.agentId).toBe("agent-x");
    expect(data.agentName).toBe("证据助手");
    // 6 = 5 类节点 + 版本夹具的 Release 行（AgentVersion.releaseId 必填 FK，
    // JSON 时代 releaseId 可指向不存在的文件，PG 下 seed 必建真实 Release）
    expect(data.nodes).toHaveLength(6);
    expect(String(data.declaration)).toContain("非因果改进证明");

    const byId = new Map(data.nodes.map((n) => [n.id, n]));

    // 时间倒序：回滚审计（09-05）最新；rel-ver-x1 与 ver-x1 同刻并列时按 id 升序
    expect(data.nodes.map((n) => n.id)).toEqual([
      "log-rb1",
      "rel-ver-x1",
      "ver-x1",
      "rel-x1",
      "tr-x1",
      "fb-x1",
    ]);

    const rb = byId.get("log-rb1")!;
    expect(rb.type).toBe("ROLLBACK");
    expect(rb.detail?.rollbackFromVersion).toBe("0.1.0");

    const ver = byId.get("ver-x1")!;
    expect(ver.type).toBe("VERSION");
    expect(ver.detail?.version).toBe("0.2.0");
    expect(ver.detail?.hasEffectivenessReport).toBe(true);

    // isRollback 的 rel-rb 不出 RELEASE 节点
    expect(byId.has("rel-rb")).toBe(false);
    const rel = byId.get("rel-x1")!;
    expect(rel.type).toBe("RELEASE");
    expect(rel.status).toBe("PENDING");
    expect(rel.detail?.aiReviewStatus).toBe("FAILED");

    const trace = byId.get("tr-x1")!;
    expect(trace.type).toBe("TRACE");
    expect(trace.status).toBe("DOWN");
    expect(trace.detail?.evalCaseId).toBe("ec-x1");

    const fb = byId.get("fb-x1")!;
    expect(fb.type).toBe("FEEDBACK");
    expect(fb.title).toBe("安全组说明不清");
    expect(fb.detail?.targetPartition).toBe("KNOWLEDGE");
  });

  it("分区级回滚审计（agent.config.update + changeNote 回滚到 Version）→ ROLLBACK 节点", async () => {
    await seedAgent("agent-y", "回滚助手");
    await prisma.auditLog.create({
      data: {
        id: "log-pr1",
        action: "agent.config.update",
        resource: "agent",
        resourceId: "agent-y",
        userName: "pm-chen",
        userRole: "product_member",
        createdAt: new Date("2026-09-07T09:00:00.000Z"),
        details: { partition: "PROMPT", changeNote: "回滚到 Version 0.1.0" } as Prisma.InputJsonValue,
      },
    });

    const res = await makeChain("agent-y");
    const json = await res.json();
    const nodes = json.data.nodes as Node[];
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("ROLLBACK");
    expect(nodes[0].detail?.scope).toBe("PARTITION");
    expect(nodes[0].detail?.partition).toBe("PROMPT");
    expect(nodes[0].detail?.restoredFromVersion).toBe("0.1.0");
  });

  it("只聚合该 Agent 自己的数据（其他 agent 的记录不串）", async () => {
    await seedAgent("agent-solo", "独享助手");
    await seedAgent("agent-other", "别家助手");
    await prisma.feedback.create({
      data: {
        id: "fb-o1",
        agentId: "agent-other",
        title: "别家的反馈",
        content: "内容",
        rating: "NEGATIVE",
        severity: "MINOR",
        status: "NEW",
        submittedBy: "cre-zhang",
        submittedAt: new Date("2026-09-01T09:00:00.000Z"),
      },
    });

    const res = await makeChain("agent-solo");
    const json = await res.json();
    expect(json.data.nodes).toEqual([]);
  });
});
