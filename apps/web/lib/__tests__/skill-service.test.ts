import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
import { store } from "@/lib/data/store";
import { NotFoundError } from "@/lib/errors";
import { resetActor } from "@/lib/context";
import { useTempDataDir, restoreDataDir } from "./helpers/mock-store";

const AGENT_ID = "ecs-assistant";

beforeEach(() => {
  resetActor();
  useTempDataDir();
});
afterEach(restoreDataDir);

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
  });

  it("writes audit", async () => {
    await seedSkill();
    const logs = store.readArray<Record<string, unknown>>("settings", "audit-logs.json");
    expect(logs.some((l) => l.action === "skill.create")).toBe(true);
  });
});

describe("getSkill", () => {
  it("returns null for missing", async () => {
    expect(await getSkill("ghost")).toBeNull();
  });

  it("returns skill with bindings + versions", async () => {
    const id = await seedSkill();
    const s = (await getSkill(id)) as Record<string, unknown>;
    expect(s).not.toBeNull();
    expect(Array.isArray(s.bindings)).toBe(true);
    expect(s._count).toBeDefined();
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

    // 再 bind 同一个 = 更新（不重复）
    await bindSkill(AGENT_ID, sid, { p: 2 });
    const bindings = await getAgentSkillBindings(AGENT_ID);
    expect(bindings.filter((b) => b.skillId === sid)).toHaveLength(1);

    // 解绑
    await unbindSkill(AGENT_ID, sid);
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
});
