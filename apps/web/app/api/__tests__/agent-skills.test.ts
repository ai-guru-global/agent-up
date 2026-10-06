import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import {
  GET as listBindings,
  POST as bindSkillRoute,
  DELETE as unbindSkillRoute,
} from "@/app/api/agents/[id]/skills/route";
import { createSkill } from "@/lib/services/skill-service";
import { _resetDb } from "@/lib/data/test-db";
import { adminActorHeaders, seedRbacAdmin, seedAgent } from "@/lib/__tests__/helpers/seed-db";
import { flushAudit, listAudit } from "@/lib/services/audit-service";

const AGENT_ID = "ecs-assistant";

function makeRequest(
  method: string,
  path: string,
  body?: unknown,
  actorHeaders: Record<string, string> = adminActorHeaders,
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: {
      "Content-Type": "application/json",
      ...(actorHeaders ?? {}),
    },
  });
}

beforeEach(async () => {
  await _resetDb();
  await seedRbacAdmin();
  await seedAgent(AGENT_ID);
});

describe("agents/[id]/skills 路由", () => {
  it("POST 绑定返回 201 + skill 实时摘要", async () => {
    const skill = (await createSkill({
      name: "route-skill",
      displayName: "路由技能",
      description: "d",
    })) as Record<string, unknown>;

    const res = await bindSkillRoute(
      makeRequest("POST", `/api/agents/${AGENT_ID}/skills`, { skillId: skill.id }),
      { params: Promise.resolve({ id: AGENT_ID }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.skillId).toBe(skill.id);
    expect(body.data.enabled).toBe(true);
    expect((body.data.skill as Record<string, unknown>).name).toBe("route-skill");
  });

  it("DELETE 解绑审计署名为请求头 actor（非 系统）", async () => {
    const skill = (await createSkill({
      name: "unbind-audit",
      displayName: "解绑审计",
      description: "d",
    })) as Record<string, unknown>;
    await bindSkillRoute(
      makeRequest("POST", `/api/agents/${AGENT_ID}/skills`, { skillId: skill.id }),
      { params: Promise.resolve({ id: AGENT_ID }) },
    );

    // RBAC 按 actor.id 查库：给 user-chen 授 agent:write，保留「请求头署名」测试意图
    const pmRole = await prisma.role.create({
      data: { id: "role-t-pm", name: "t_pm", displayName: "测试产品" },
    });
    const permW = await prisma.permission.findUniqueOrThrow({
      where: { resource_action: { resource: "agent", action: "write" } },
    });
    await prisma.rolePermission.create({ data: { roleId: pmRole.id, permissionId: permW.id } });
    await prisma.user.create({ data: { id: "user-chen", email: "chen@t.local", name: "pm-chen" } });
    await prisma.userRole.create({
      data: { id: "ur-t-chen", userId: "user-chen", roleId: pmRole.id, assignedBy: "test" },
    });

    // HTTP 头仅限 Latin-1：actor 名用 ASCII
    const res = await unbindSkillRoute(
      makeRequest(
        "DELETE",
        `/api/agents/${AGENT_ID}/skills?agentId=${AGENT_ID}&skillId=${skill.id}`,
        undefined,
        { "x-actor-id": "user-chen", "x-actor-name": "pm-chen", "x-actor-role": "product_member" },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ deleted: true });

    await flushAudit();
    const audits = await listAudit({ action: "skill.unbind", resourceId: AGENT_ID });
    expect(audits.length).toBeGreaterThan(0);
    expect(audits[0].userName).toBe("pm-chen");
    expect(audits[0].userId).toBe("user-chen");
  });

  it("GET 返回绑定列表（agent 摘要兜底）", async () => {
    const skill = (await createSkill({
      name: "get-bindings",
      displayName: "列表",
      description: "d",
    })) as Record<string, unknown>;
    await bindSkillRoute(
      makeRequest("POST", `/api/agents/${AGENT_ID}/skills`, { skillId: skill.id }),
      { params: Promise.resolve({ id: AGENT_ID }) },
    );

    const res = await listBindings(makeRequest("GET", `/api/agents/${AGENT_ID}/skills`), {
      params: Promise.resolve({ id: AGENT_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect((body.data[0] as Record<string, unknown>).skillId).toBe(skill.id);
  });
});
