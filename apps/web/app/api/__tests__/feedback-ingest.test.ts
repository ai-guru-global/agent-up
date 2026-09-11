import { readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as ingestFeedback } from "@/app/api/feedback/ingest/route";
import { store, _getDataDir } from "@/lib/data/store";
import { resetActor } from "@/lib/context";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";
import { listAudit, flushAudit } from "@/lib/services/audit-service";
import { _resetDb } from "@/lib/data/test-db";

/**
 * POST /api/feedback/ingest — 多渠道工单适配器（R5b）。
 * 反馈入口从「人」（web 表单 / Chrome 插件走 /api/feedback）扩展为
 * 「工单系统原生日志接入」：按 channel 适配规范化外部 payload，
 * 记录来源渠道与外部单号，同单号幂等（重复接入 409）。
 */

function writeAgent(id: string) {
  store.write({ id, name: `助手-${id}`, status: "ACTIVE" }, "agents", `${id}.json`);
}

function ingest(body: unknown) {
  return ingestFeedback(
    new NextRequest("http://localhost/api/feedback/ingest", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

/** useTempDataDir 会拷贝运行时 data/，清空 feedback 与审计日志（含「 2」重名副本等旁支文件）保证断言确定性 */
function clearRuntimeData() {
  const dir = join(_getDataDir(), "feedback");
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".json")) unlinkSync(join(dir, name));
  }
  store.write([], "settings", "audit-logs.json");
}

// 批1 起审计以 Prisma 为事实源：清 worker 测试库保证 listAudit 断言确定性
beforeEach(async () => {
  resetActor();
  await _resetDb();
  useTempDataDir();
  clearRuntimeData();
});

afterEach(() => {
  restoreDataDir();
});

describe("POST /api/feedback/ingest（多渠道工单适配器）", () => {
  it("generic 渠道：字段直映射，rating 缺省 NEGATIVE，记来源与外部单号，写审计", async () => {
    writeAgent("agent-g");
    const res = await ingest({
      channel: "generic",
      agentId: "agent-g",
      title: "工单：无法创建快照",
      content: "控制台创建快照报错 InternalError",
      severity: "MAJOR",
      externalId: "TCK-1001",
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    const fb = json.data as Record<string, unknown>;
    expect(fb.source).toBe("generic");
    expect(fb.rating).toBe("NEGATIVE");
    expect(fb.severity).toBe("MAJOR");
    expect(fb.externalRef).toEqual({ id: "TCK-1001", url: null });

    await flushAudit();
    const audits = await listAudit({ action: "feedback.ingest" });
    expect(audits).toHaveLength(1);
    expect(audits[0].details?.channel).toBe("generic");
  });

  it("ticket-webhook 渠道：subject/description/priority 适配（P0→CRITICAL，P2→MINOR），单号入 externalRef", async () => {
    writeAgent("agent-t");
    const res = await ingest({
      channel: "ticket-webhook",
      agentId: "agent-t",
      ticket: {
        key: "TICKET-42",
        subject: "ECS 实例无法 SSH",
        description: "安全组已放通 22 端口但仍连不上",
        priority: "P0",
        url: "https://ticket.example.com/TICKET-42",
      },
    });
    expect(res.status).toBe(201);
    const fb = (await res.json()).data as Record<string, unknown>;
    expect(fb.source).toBe("ticket-webhook");
    expect(fb.title).toBe("ECS 实例无法 SSH");
    expect(fb.content).toBe("安全组已放通 22 端口但仍连不上");
    expect(fb.severity).toBe("CRITICAL");
    expect(fb.rating).toBe("NEGATIVE");
    expect(fb.externalRef).toEqual({ id: "TICKET-42", url: "https://ticket.example.com/TICKET-42" });

    const res2 = await ingest({
      channel: "ticket-webhook",
      agentId: "agent-t",
      ticket: { key: "TICKET-43", subject: "s", description: "d", priority: "P2" },
    });
    expect(res2.status).toBe(201);
    expect(((await res2.json()).data as Record<string, unknown>).severity).toBe("MINOR");
  });

  it("同渠道同外部单号重复接入 → 409，不产生第二条反馈", async () => {
    writeAgent("agent-d");
    const body = {
      channel: "ticket-webhook",
      agentId: "agent-d",
      ticket: { key: "DUP-1", subject: "第一次", description: "d", priority: "P1" },
    };
    const first = await ingest(body);
    expect(first.status).toBe(201);

    const second = await ingest({ ...body, ticket: { ...body.ticket, subject: "重发" } });
    expect(second.status).toBe(409);
    const all = store.list<Record<string, unknown>>("feedback").filter(
      (f) => (f.externalRef as Record<string, unknown> | null)?.id === "DUP-1",
    );
    expect(all).toHaveLength(1);
    expect((all[0].title as string)).toBe("第一次");
  });

  it("未知渠道 → 422；缺 ticket.subject → 422；agent 不存在 → 404", async () => {
    writeAgent("agent-v");
    const bad = await ingest({ channel: "email", agentId: "agent-v", title: "t", content: "c" });
    expect(bad.status).toBe(422);

    const missing = await ingest({
      channel: "ticket-webhook",
      agentId: "agent-v",
      ticket: { key: "X-1", description: "d", priority: "P1" },
    });
    expect(missing.status).toBe(422);

    const noAgent = await ingest({
      channel: "generic",
      agentId: "ghost",
      title: "t",
      content: "c",
    });
    expect(noAgent.status).toBe(404);
  });
});
