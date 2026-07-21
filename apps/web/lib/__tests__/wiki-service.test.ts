import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createVault,
  getVault,
  updateVault,
  deleteVault,
  listVaults,
  createPage,
  getPage,
  updatePage,
  deletePage,
  listPages,
} from "@/lib/services/wiki-service";
import { store } from "@/lib/data/store";
import { NotFoundError } from "@/lib/errors";
import { resetActor } from "@/lib/context";
import { useTempDataDir, restoreDataDir } from "./helpers/mock-store";

beforeEach(() => {
  resetActor();
  useTempDataDir();
});
afterEach(restoreDataDir);

const SEED_VAULT = "ecs-wiki";

describe("vault CRUD", () => {
  it("createVault + getVault + audit", async () => {
    const v = (await createVault({ name: "新库" })) as Record<string, unknown>;
    expect(v.name).toBe("新库");
    expect(v.pageCount).toBe(0);
    const got = await getVault(v.id as string);
    expect(got).not.toBeNull();
    const logs = store.readArray<Record<string, unknown>>("settings", "audit-logs.json");
    expect(logs.some((l) => l.action === "wiki.vault.create")).toBe(true);
  });

  it("updateVault throws NotFoundError", async () => {
    await expect(updateVault("ghost", {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updateVault + deleteVault", async () => {
    const v = (await createVault({ name: "x" })) as Record<string, unknown>;
    const updated = (await updateVault(v.id as string, {
      description: "desc",
    })) as Record<string, unknown>;
    expect(updated.description).toBe("desc");
    const deleted = await deleteVault(v.id as string);
    expect(deleted).toEqual({ deleted: true });
    expect(await getVault(v.id as string)).toBeNull();
  });

  it("deleteVault throws NotFoundError", async () => {
    await expect(deleteVault("ghost")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("listVaults filters by agentId + shared", async () => {
    const result = await listVaults({
      skip: 0,
      take: 100,
      agentId: "ecs-assistant",
    });
    expect(
      result.items.every((v) => v.agentId === "ecs-assistant"),
    ).toBe(true);
  });
});

describe("page CRUD", () => {
  it("createPage throws NotFoundError for missing vault", async () => {
    await expect(
      createPage({ vaultId: "ghost", title: "t", slug: "s", content: "c" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("createPage + getPage + audit", async () => {
    const p = (await createPage({
      vaultId: SEED_VAULT,
      title: "新页面",
      slug: "new-page",
      content: "内容",
      tier: "CORE",
    })) as Record<string, unknown>;
    expect(p.title).toBe("新页面");
    expect(p.tier).toBe("CORE");
    expect(p.lifecycle).toBe("DRAFT");

    const got = await getPage(p.id as string);
    expect(got).not.toBeNull();
    expect(got).toHaveProperty("vault");

    const logs = store.readArray<Record<string, unknown>>("settings", "audit-logs.json");
    expect(logs.some((l) => l.action === "wiki.page.create")).toBe(true);
  });

  it("updatePage + deletePage", async () => {
    const p = (await createPage({
      vaultId: SEED_VAULT,
      title: "t",
      slug: "s",
      content: "c",
    })) as Record<string, unknown>;
    const updated = (await updatePage(p.id as string, {
      title: "改",
    })) as Record<string, unknown>;
    expect(updated.title).toBe("改");
    const deleted = await deletePage(p.id as string);
    expect(deleted).toEqual({ deleted: true });
    expect(await getPage(p.id as string)).toBeNull();
  });

  it("updatePage / deletePage throw NotFoundError for missing", async () => {
    await expect(updatePage("ghost", {})).rejects.toBeInstanceOf(NotFoundError);
    await expect(deletePage("ghost")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("listPages filters + paginates", async () => {
    const result = await listPages({
      vaultId: SEED_VAULT,
      skip: 0,
      take: 100,
    });
    expect(result.total).toBeGreaterThan(0);

    const filtered = await listPages({
      vaultId: SEED_VAULT,
      skip: 0,
      take: 100,
      lifecycle: "VERIFIED",
    });
    expect(
      filtered.items.every((p) => p.lifecycle === "VERIFIED"),
    ).toBe(true);
  });

  it("listPages returns empty for missing vault dir", async () => {
    const result = await listPages({
      vaultId: "ghost-vault",
      skip: 0,
      take: 100,
    });
    expect(result).toEqual({ items: [], total: 0 });
  });
});
