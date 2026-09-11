import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getVersionLineage } from "@/app/api/agents/[id]/version-lineage/route";
import { store } from "@/lib/data/store";
import { resetActor } from "@/lib/context";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";

/**
 * GET /api/agents/[id]/version-lineage — Harness 资产版本化（R5a）。
 * 把每版本的 configSnapshot 升级为带跨版本变更历史的资产演进线：
 * 按 publishedAt 升序相邻两两 diff（剥离快照元数据键 version/lastModifiedAt），
 * 每版本给出 vs 上一版本的 4 分区 added/removed/changed 键计数。
 * 只读聚合，无新存储；不动现有 /versions 响应形状。
 */

type LineageEntry = {
  versionId: string;
  version: string;
  publishedAt: string;
  changedPartitions: string[] | null;
  diffSummary: Record<string, { added: number; removed: number; changed: number }> | null;
};

function writeAgent(id: string, name: string) {
  store.write({ id, name, status: "ACTIVE" }, "agents", `${id}.json`);
}

/** 最小 4 分区快照：version/lastModifiedAt 是应被剥离的元数据键 */
function snapshots(prompts: Record<string, unknown> | null) {
  return {
    promptSnapshot: prompts
      ? { ...prompts, version: 3, lastModifiedAt: "2026-01-01T00:00:00.000Z" }
      : null,
    knowledgeSnapshot: null,
    toolsSnapshot: null,
    routingSnapshot: null,
  };
}

function writeVersion(id: string, agentId: string, version: string, publishedAt: string, prompts: Record<string, unknown> | null, changeNote?: string) {
  store.write(
    {
      id,
      agentId,
      version,
      major: 0,
      minor: 1,
      patch: 0,
      ...snapshots(prompts),
      releaseId: null,
      publishedBy: "pm-chen",
      publishedAt,
      changeNote: changeNote ?? null,
      effectivenessReport: null,
    },
    "versions",
    `${id}.json`,
  );
}

function makeCall(id: string) {
  return getVersionLineage(
    new NextRequest(`http://localhost/api/agents/${id}/version-lineage`, { method: "GET" }),
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

describe("GET /api/agents/[id]/version-lineage（资产演进历史）", () => {
  it("agent 不存在 → 404", async () => {
    const res = await makeCall("no-such-agent");
    expect(res.status).toBe(404);
  });

  it("单版本 = 基线：changedPartitions 与 diffSummary 为 null", async () => {
    writeAgent("agent-one", "基线助手");
    writeVersion("ver-a", "agent-one", "0.1.0", "2026-09-01T09:00:00.000Z", {
      systemPrompt: "v1",
    });

    const res = await makeCall("agent-one");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.lineage).toHaveLength(1);
    const first = json.data.lineage[0] as LineageEntry;
    expect(first.version).toBe("0.1.0");
    expect(first.changedPartitions).toBeNull();
    expect(first.diffSummary).toBeNull();
  });

  it("相邻版本 diff：PROMPT 增/删/改计数正确；未变分区不进 changedPartitions；元数据键不参与比较", async () => {
    writeAgent("agent-lineage", "演进助手");
    writeVersion("ver-v1", "agent-lineage", "0.1.0", "2026-09-01T09:00:00.000Z", {
      systemPrompt: "你是 ECS 助手",
      constraints: ["不回答无关问题"],
    });
    writeVersion("ver-v2", "agent-lineage", "0.2.0", "2026-09-02T09:00:00.000Z", {
      systemPrompt: "你是阿里云 ECS 工单助手", // changed
      constraints: ["只聊 ECS", "不回答无关问题"], // added + kept（changed 对象会记录 constraints）
      outputFormat: "markdown", // added
    });

    const res = await makeCall("agent-lineage");
    const json = await res.json();
    const lineage = json.data.lineage as LineageEntry[];
    expect(lineage).toHaveLength(2);
    expect(lineage[0].version).toBe("0.1.0");

    const second = lineage[1];
    expect(second.versionId).toBe("ver-v2");
    expect(second.changedPartitions).toEqual(["PROMPT"]);
    const prompt = second.diffSummary?.PROMPT;
    expect(prompt).toEqual({ added: 1, removed: 0, changed: 2 });
    expect(second.diffSummary?.KNOWLEDGE).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  it("多版本乱序写入仍按 publishedAt 升序组成演进线；跨 Agent 版本不串", async () => {
    writeAgent("agent-sorted", "排序助手");
    writeAgent("agent-other", "别家助手");
    writeVersion("ver-s2", "agent-sorted", "0.2.0", "2026-09-03T09:00:00.000Z", { systemPrompt: "v2" });
    writeVersion("ver-o1", "agent-other", "9.9.9", "2026-09-02T09:00:00.000Z", { systemPrompt: "别家" });
    writeVersion("ver-s1", "agent-sorted", "0.1.0", "2026-09-01T09:00:00.000Z", { systemPrompt: "v1" });
    writeVersion("ver-s3", "agent-sorted", "0.3.0", "2026-09-04T09:00:00.000Z", { systemPrompt: "v2" }); // 与 v2 相同 → 无变更

    const res = await makeCall("agent-sorted");
    const json = await res.json();
    const lineage = json.data.lineage as LineageEntry[];
    expect(lineage.map((v) => v.versionId)).toEqual(["ver-s1", "ver-s2", "ver-s3"]);
    // v2→v3 快照完全一致 → changedPartitions 空数组（不是 null）
    expect(lineage[2].changedPartitions).toEqual([]);
    expect(lineage[2].diffSummary?.PROMPT).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  it("快照缺失（null）→ 视为空对象参与 diff（内容出现记 added）", async () => {
    writeAgent("agent-null", "空快照助手");
    writeVersion("ver-n1", "agent-null", "0.1.0", "2026-09-01T09:00:00.000Z", null);
    writeVersion("ver-n2", "agent-null", "0.2.0", "2026-09-02T09:00:00.000Z", { systemPrompt: "首次配置" });

    const res = await makeCall("agent-null");
    const json = await res.json();
    const second = (json.data.lineage as LineageEntry[])[1];
    expect(second.changedPartitions).toEqual(["PROMPT"]);
    expect(second.diffSummary?.PROMPT).toEqual({ added: 1, removed: 0, changed: 0 });
  });
});
