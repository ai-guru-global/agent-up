import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { POST as rollback } from "@/app/api/agents/[id]/rollback/[versionId]/route";
import { GET as getConfig } from "@/app/api/agents/[id]/config/[partition]/route";
import { resetActor } from "@/lib/context";
import { _resetDb } from "@/lib/data/test-db";
import { seedAgent, seedReleaseWithVersion } from "@/lib/__tests__/helpers/seed-db";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";
import { flushAudit, listAudit } from "@/lib/services/audit-service";

const AGENT_ID = "ecs-assistant";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

// 批4 起版本/release 事实源在 PG：夹具自控快照内容（不带 wikiVaultId，无需 vault 前置种子）
beforeEach(async () => {
  resetActor();
  useTempDataDir();
  await _resetDb();
  await seedAgent(AGENT_ID);
  await seedReleaseWithVersion({
    agentId: AGENT_ID,
    versionId: "ver-001",
    version: "0.1.0",
    changeNote: "初始发布",
    snapshots: {
      prompt: { systemPrompt: "你是一个专业的 ECS 云服务器技术支持助手（回滚目标）" },
      knowledge: { searchStrategy: "WIKI_FIRST", fallbackToMcp: true, maxWikiResults: 3 },
      tools: { mcpTools: [], wikiQueryTools: [], maxConcurrentCalls: 3, timeoutMs: 30000 },
      routing: { rules: [], humanThreshold: 0.3, maxConversationTurns: 10 },
    },
  });
  await seedReleaseWithVersion({
    agentId: AGENT_ID,
    versionId: "ver-002",
    version: "0.2.0",
    changeNote: "反馈优化发布",
    snapshots: {
      prompt: { systemPrompt: "你是一个专业的 ECS 助手（v2，不是回滚目标）" },
    },
  });
  await seedAgent("rds-assistant", "RDS 助手");
  await seedReleaseWithVersion({
    agentId: "rds-assistant",
    versionId: "ver-rds-001",
    version: "0.1.0",
    changeNote: "RDS 初始发布",
  });
});
afterEach(async () => {
  await flushAudit();
  restoreDataDir();
});

describe("POST /api/agents/[id]/rollback/[versionId]", () => {
  it("rolls back the whole agent to ver-001 (4 partitions at once)", async () => {
    // ver-001 的 promptSnapshot 的 systemPrompt 以 "你是一个专业的 ECS..." 开头
    const res = await rollback(makeRequest(), {
      params: Promise.resolve({ id: AGENT_ID, versionId: "ver-001" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();

    // 顶层结构
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty("release");
    expect(json.data).toHaveProperty("version");
    expect(json.data).toHaveProperty("restoredFrom");

    // restoredFrom 指向 ver-001
    expect(json.data.restoredFrom.id).toBe("ver-001");
    expect(json.data.restoredFrom.version).toBe("0.1.0");

    // 立即生成了新 version（ver-002 已存在 0.2.0，回滚后会递增）
    expect(json.data.version.id).not.toBe("ver-001");
    expect(json.data.version.id).not.toBe("ver-002");

    // release 标记为回滚、APPROVED
    expect(json.data.release.status).toBe("APPROVED");
    expect(json.data.release.isRollback).toBe(true);
    expect(json.data.release.rollbackFromVersion).toBe("0.1.0");

    // 实际 config 被覆盖
    const promptRes = await getConfig(makeRequest(), {
      params: Promise.resolve({ id: AGENT_ID, partition: "prompt" }),
    });
    const prompt = (await promptRes.json()).data;
    expect(prompt.systemPrompt).toContain("你是一个专业的 ECS");
  });

  it("writes a new release with configSnapshot from target version", async () => {
    await rollback(makeRequest(), {
      params: Promise.resolve({ id: AGENT_ID, versionId: "ver-001" }),
    });
    const rb = await prisma.release.findFirst({ where: { isRollback: true } });
    expect(rb).toBeTruthy();
    expect(rb!.status).toBe("APPROVED");
    const snapshot = rb!.configSnapshot as unknown as Record<string, unknown>;
    expect(rb!.configSnapshot).toBeTruthy();
    expect(snapshot.prompt).toBeTruthy();
    expect(snapshot.knowledge).toBeTruthy();
  });

  it("writes audit log with action=agent.rollback", async () => {
    await rollback(makeRequest(), {
      params: Promise.resolve({ id: AGENT_ID, versionId: "ver-001" }),
    });
    await flushAudit();
    const logs = await listAudit();
    const rollbackLog = logs.find((l) => l.action === "agent.rollback");
    expect(rollbackLog).toBeTruthy();
    expect(rollbackLog!.resourceId).toBe(AGENT_ID);
    const details = rollbackLog!.details as Record<string, unknown>;
    expect(details.rollbackFromVersion).toBe("0.1.0");
    expect(details.partitions).toEqual([
      "PROMPT",
      "KNOWLEDGE",
      "TOOLS",
      "ROUTING",
    ]);
  });

  it("returns 404 for missing version", async () => {
    const res = await rollback(makeRequest(), {
      params: Promise.resolve({ id: AGENT_ID, versionId: "ghost-version" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 422 when version belongs to a different agent", async () => {
    const res = await rollback(makeRequest(), {
      params: Promise.resolve({ id: AGENT_ID, versionId: "ver-rds-001" }),
    });
    expect(res.status).toBe(422);
  });

  it("returns 404 for missing agent", async () => {
    const res = await rollback(makeRequest(), {
      params: Promise.resolve({ id: "ghost-agent", versionId: "ver-001" }),
    });
    expect(res.status).toBe(404);
  });

  it("new version has higher semver than existing ones (from 0.2.0 forward)", async () => {
    // 当前最高 0.2.0（ver-002），4 分区都变 → minor +1 → 至少 0.3.0
    // 用动态比较（> 0.2.0）而不是写死 ["0.3.0"] —— 避免种子数据变动导致测试脆弱
    const res = await rollback(makeRequest(), {
      params: Promise.resolve({ id: AGENT_ID, versionId: "ver-001" }),
    });
    const json = await res.json();
    const newVer = json.data.version.version as string;

    function parse(v: string): [number, number, number] {
      return v.split(".").map(Number) as [number, number, number];
    }
    const [nmaj, nmin, npatch] = parse(newVer);
    const [bmaj, bmin, bpatch] = parse("0.2.0");
    const isGreater =
      nmaj > bmaj ||
      (nmaj === bmaj && nmin > bmin) ||
      (nmaj === bmaj && nmin === bmin && npatch > bpatch);
    expect(isGreater).toBe(true);
  });
});
