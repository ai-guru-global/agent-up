import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@agent-up/db";
import {
  createSkill,
  getSkill,
  updateSkill,
  deleteSkill,
  bindSkill,
  unbindSkill,
  getAgentSkillBindings,
  toggleSkillBinding,
  listSkills,
} from "@/lib/services/skill-service";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { resetActor } from "@/lib/context";
import { _resetDb } from "@/lib/data/test-db";
import { seedAgent } from "./helpers/seed-db";
import { flushAudit, listAudit } from "@/lib/services/audit-service";

const AGENT_ID = "ecs-assistant";

beforeEach(async () => {
  resetActor();
  await _resetDb();
  await seedAgent(AGENT_ID);
});

async function seedSkill(): Promise<string> {
  const skill = (await createSkill({
    name: "test-skill",
    displayName: "测试技能",
    description: "d",
    category: "DATA_FETCH",
    runtime: "MCP",
  })) as Record<string, unknown>;
  return skill.id as string;
}

describe("createSkill", () => {
  it("creates with defaults", async () => {
    const s = (await createSkill({
      name: "x",
      displayName: "X",
      description: "d",
    })) as Record<string, unknown>;
    expect(s.status).toBe("DRAFT");
    expect(s.version).toBe("1.0.0");
    expect(s.category).toBe("GENERAL");
    expect(s.runtime).toBe("HTTP");
    expect(s._count).toEqual({ bindings: 0, versions: 0 });
    expect(typeof s.createdAt).toBe("string");
  });

  it("rejects duplicate name (409)", async () => {
    await seedSkill();
    await expect(
      createSkill({ name: "test-skill", displayName: "重复", description: "d" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("writes audit (PG 事实源)", async () => {
    const s = (await createSkill({
      name: "audit-skill",
      displayName: "审计",
      description: "d",
    })) as Record<string, unknown>;
    await flushAudit();
    const audits = await listAudit({ action: "skill.create", resourceId: s.id as string });
    expect(audits.length).toBeGreaterThan(0);
  });
});

describe("getSkill", () => {
  it("returns null for missing", async () => {
    expect(await getSkill("ghost")).toBeNull();
  });

  it("returns skill with bindings (agent+skill snapshot) + _count", async () => {
    const sid = await seedSkill();
    await bindSkill(AGENT_ID, sid, { p: 1 });
    const s = (await getSkill(sid)) as Record<string, unknown>;
    expect(s).not.toBeNull();
    expect(Array.isArray(s.bindings)).toBe(true);
    const binding = (s.bindings as Record<string, unknown>[])[0];
    expect(binding.agent).toEqual({ id: AGENT_ID, name: "ECS 助手" });
    expect((binding.skill as Record<string, unknown>).name).toBe("test-skill");
    expect(binding.config).toEqual({ p: 1 });
    // boundAt 映射到旧契约键 createdAt
    expect(typeof binding.createdAt).toBe("string");
    expect(s._count).toEqual({ bindings: 1, versions: 0 });
  });
});

describe("updateSkill / deleteSkill", () => {
  it("throws NotFoundError for missing", async () => {
    await expect(updateSkill("ghost", {})).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteSkill("ghost")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updates + archives", async () => {
    const id = await seedSkill();
    const updated = (await updateSkill(id, {
      displayName: "改名",
    })) as Record<string, unknown>;
    expect(updated.displayName).toBe("改名");
    const archived = (await deleteSkill(id)) as Record<string, unknown>;
    expect(archived.status).toBe("ARCHIVED");
  });
});

describe("bindSkill / unbindSkill", () => {
  it("throws NotFoundError for missing agent", async () => {
    const sid = await seedSkill();
    await expect(bindSkill("ghost", sid)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError for missing skill", async () => {
    await expect(bindSkill(AGENT_ID, "ghost")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("binds then unbinds", async () => {
    const sid = await seedSkill();
    const binding = (await bindSkill(AGENT_ID, sid, { p: 1 })) as Record<
      string,
      unknown
    >;
    expect(binding.skillId).toBe(sid);
    expect(binding.enabled).toBe(true);
    expect(binding.agentId).toBe(AGENT_ID);

    // 再 bind 同一个 = 幂等 upsert（合并 config、不重复建行）
    await bindSkill(AGENT_ID, sid, { p: 2 });
    const bindings = await getAgentSkillBindings(AGENT_ID);
    expect(bindings.filter((b) => b.skillId === sid)).toHaveLength(1);
    expect((bindings[0] as Record<string, unknown>).config).toEqual({ p: 2 });

    // 解绑：静默成功
    const r = await unbindSkill(AGENT_ID, sid);
    expect(r).toEqual({ deleted: true });
    const after = await getAgentSkillBindings(AGENT_ID);
    expect(after.filter((b) => b.skillId === sid)).toHaveLength(0);
  });

  it("toggleSkillBinding throws for missing binding", async () => {
    await expect(
      toggleSkillBinding(AGENT_ID, "ghost", false),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getAgentSkillBindings returns [] for missing agent", async () => {
    expect(await getAgentSkillBindings("ghost")).toEqual([]);
  });

  it("getAgentSkillBindings orders by priority desc", async () => {
    const sidA = await seedSkill();
    const sidB = (await createSkill({
      name: "low-prio",
      displayName: "低优先",
      description: "d",
    })) as Record<string, unknown>;
    await bindSkill(AGENT_ID, sidA);
    await bindSkill(AGENT_ID, sidB.id as string);
    await prisma.agentSkillBinding.update({
      where: { agentId_skillId: { agentId: AGENT_ID, skillId: sidB.id as string } },
      data: { priority: 5 },
    });
    const bindings = await getAgentSkillBindings(AGENT_ID);
    expect((bindings[0] as Record<string, unknown>).skillId).toBe(sidB.id);
  });
});

describe("listSkills", () => {
  it("filters by category + status + search", async () => {
    await seedSkill();
    const result = await listSkills({
      skip: 0,
      take: 100,
      category: "DATA_FETCH",
    });
    expect(
      result.items.every((s) => s.category === "DATA_FETCH"),
    ).toBe(true);

    const searched = await listSkills({
      skip: 0,
      take: 100,
      search: "test",
    });
    expect(searched.items.length).toBeGreaterThan(0);
  });

  it("ALL 豁免过滤", async () => {
    await seedSkill();
    const all = await listSkills({ skip: 0, take: 100, category: "ALL" });
    expect(all.items.length).toBeGreaterThan(0);
  });
});
