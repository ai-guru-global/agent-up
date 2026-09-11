import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getEvidenceChain } from "@/app/api/agents/[id]/evidence-chain/route";
import { store } from "@/lib/data/store";
import { resetActor } from "@/lib/context";
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

function writeAgent(id: string, name: string) {
  store.write({ id, name, status: "ACTIVE" }, "agents", `${id}.json`);
}

function makeChain(id: string) {
  return getEvidenceChain(
    new NextRequest(`http://localhost/api/agents/${id}/evidence-chain`, { method: "GET" }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  resetActor();
  useTempDataDir();
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
    writeAgent("agent-empty", "空助手");
    const res = await makeChain("agent-empty");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.nodes).toEqual([]);
    expect(String(json.data.declaration)).toContain("非因果改进证明");
  });

  it("五类节点按时间倒序聚合；trace 关联已沉淀用例；isRollback release 不重复出 RELEASE 节点", async () => {
    writeAgent("agent-x", "证据助手");

    // 反馈（09-01）
    store.write(
      {
        id: "fb-x1",
        agentId: "agent-x",
        title: "安全组说明不清",
        content: "内容",
        rating: "NEGATIVE",
        severity: "MAJOR",
        status: "NEW",
        targetPartition: "KNOWLEDGE",
        submittedBy: "cre-zhang",
        submittedAt: "2026-09-01T09:00:00.000Z",
      },
      "feedback",
      "fb-x1.json",
    );

    // 试聊 trace（09-02）+ 已沉淀用例
    store.write(
      {
        id: "tr-x1",
        agentId: "agent-x",
        systemPrompt: "s",
        history: [],
        message: "SSH 连不上怎么排查",
        reply: "r",
        model: "mimo-v2.5-pro",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latencyMs: 900,
        createdAt: "2026-09-02T10:00:00.000Z",
        rating: "DOWN",
        ratedAt: "2026-09-02T10:01:00.000Z",
        note: "第一步没提安全组",
      },
      "traces",
      "tr-x1.json",
    );
    store.write(
      {
        id: "ec-x1",
        agentId: "agent-x",
        sourceTraceId: "tr-x1",
        title: "SSH 排查",
        status: "ACTIVE",
      },
      "eval-cases",
      "ec-x1.json",
    );

    // Release（09-03，AI 评测 FAILED）+ 一条 isRollback 的回滚 release（不应出 RELEASE 节点）
    store.write(
      {
        id: "rel-x1",
        agentId: "agent-x",
        changeNote: "补风险提示",
        changedPartitions: ["PROMPT"],
        status: "PENDING",
        submittedBy: "pm-chen",
        submittedAt: "2026-09-03T09:00:00.000Z",
        aiReview: { status: "FAILED", computedAt: "2026-09-03T09:05:00.000Z" },
      },
      "releases",
      "rel-x1.json",
    );
    store.write(
      {
        id: "rel-rb",
        agentId: "agent-x",
        changeNote: "回滚到 Version 0.1.0",
        isRollback: true,
        status: "APPROVED",
        submittedAt: "2026-09-06T09:00:00.000Z",
      },
      "releases",
      "rel-rb.json",
    );

    // Version（09-04，含效果报告）
    store.write(
      {
        id: "ver-x1",
        agentId: "agent-x",
        version: "0.2.0",
        releaseId: "rel-older",
        publishedAt: "2026-09-04T09:00:00.000Z",
        effectivenessReport: { totalFeedbacks: 2, computedAt: "2026-09-11T00:00:00.000Z" },
      },
      "versions",
      "ver-x1.json",
    );

    // 回滚审计（09-05，整版本回滚）
    store.writeArray(
      [
        {
          id: "log-rb1",
          action: "agent.rollback",
          resource: "agent",
          resourceId: "agent-x",
          userName: "admin-zhao",
          userRole: "platform_admin",
          createdAt: "2026-09-05T09:00:00.000Z",
          details: { rollbackFromVersion: "0.1.0", newVersion: "0.3.0" },
        },
      ],
      "settings",
      "audit-logs.json",
    );

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
    expect(data.nodes).toHaveLength(5);
    expect(String(data.declaration)).toContain("非因果改进证明");

    // 时间倒序
    const [rb, ver, rel, trace, fb] = data.nodes;
    expect(rb.type).toBe("ROLLBACK");
    expect(rb.id).toBe("log-rb1");
    expect(rb.detail?.rollbackFromVersion).toBe("0.1.0");

    expect(ver.type).toBe("VERSION");
    expect(ver.id).toBe("ver-x1");
    expect(ver.detail?.version).toBe("0.2.0");
    expect(ver.detail?.hasEffectivenessReport).toBe(true);

    expect(rel.type).toBe("RELEASE");
    expect(rel.id).toBe("rel-x1");
    expect(rel.status).toBe("PENDING");
    expect(rel.detail?.aiReviewStatus).toBe("FAILED");
    expect(data.nodes.some((n) => n.id === "rel-rb")).toBe(false);

    expect(trace.type).toBe("TRACE");
    expect(trace.id).toBe("tr-x1");
    expect(trace.status).toBe("DOWN");
    expect(trace.detail?.evalCaseId).toBe("ec-x1");

    expect(fb.type).toBe("FEEDBACK");
    expect(fb.id).toBe("fb-x1");
    expect(fb.title).toBe("安全组说明不清");
    expect(fb.detail?.targetPartition).toBe("KNOWLEDGE");
  });

  it("分区级回滚审计（agent.config.update + changeNote 回滚到 Version）→ ROLLBACK 节点", async () => {
    writeAgent("agent-y", "回滚助手");
    store.writeArray(
      [
        {
          id: "log-pr1",
          action: "agent.config.update",
          resource: "agent",
          resourceId: "agent-y",
          userName: "pm-chen",
          userRole: "product_member",
          createdAt: "2026-09-07T09:00:00.000Z",
          details: { partition: "PROMPT", changeNote: "回滚到 Version 0.1.0" },
        },
      ],
      "settings",
      "audit-logs.json",
    );

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
    writeAgent("agent-solo", "独享助手");
    writeAgent("agent-other", "别家助手");
    store.write(
      {
        id: "fb-o1",
        agentId: "agent-other",
        title: "别家的反馈",
        rating: "NEGATIVE",
        severity: "MINOR",
        status: "NEW",
        submittedAt: "2026-09-01T09:00:00.000Z",
      },
      "feedback",
      "fb-o1.json",
    );

    const res = await makeChain("agent-solo");
    const json = await res.json();
    expect(json.data.nodes).toEqual([]);
  });
});
