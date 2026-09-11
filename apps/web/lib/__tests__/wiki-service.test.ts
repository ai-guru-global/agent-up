import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@agent-up/db";
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
import { NotFoundError, ConflictError } from "@/lib/errors";
import { resetActor } from "@/lib/context";
import { _resetDb } from "@/lib/data/test-db";
import { seedAgent } from "./helpers/seed-db";
import { flushAudit, listAudit } from "@/lib/services/audit-service";

const AGENT_ID = "ecs-assistant";

let vaultId: string;

beforeEach(async () => {
  resetActor();
  await _resetDb();
  await seedAgent(AGENT_ID);
  const v = (await createVault({ name: "测试库" })) as Record<string, unknown>;
  vaultId = v.id as string;
});

describe("vault CRUD", () => {
  it("createVault + getVault + audit", async () => {
    const v = (await createVault({ name: "新库" })) as Record<string, unknown>;
    expect(v.name).toBe("新库");
    expect(v._count).toEqual({ pages: 0, ingestJobs: 0 });
    expect(v.agent).toBeNull();

    const got = await getVault(v.id as string);
    expect(got).not.toBeNull();

    await flushAudit();
    const audits = await listAudit({ action: "wiki.vault.create", resourceId: v.id as string });
    expect(audits.length).toBeGreaterThan(0);
  });

  it("updateVault throws NotFoundError", async () => {
    await expect(updateVault("ghost", {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updateVault + deleteVault", async () => {
    const updated = (await updateVault(vaultId, { description: "desc" })) as Record<string, unknown>;
    expect(updated.description).toBe("desc");
    const deleted = await deleteVault(vaultId);
    expect(deleted).toEqual({ deleted: true });
    expect(await getVault(vaultId)).toBeNull();
  });

  it("deleteVault throws NotFoundError", async () => {
    await expect(deleteVault("ghost")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deleteVault 级联删除 pages + ingestJobs", async () => {
    await createPage({ vaultId, title: "级联页", slug: "cascade", content: "c" });
    await prisma.wikiIngestJob.create({
      data: { vaultId, jobType: "INGEST", sourceType: "TEXT", triggeredBy: "test" },
    });

    await deleteVault(vaultId);
    expect(await prisma.wikiPage.count({ where: { vaultId } })).toBe(0);
    expect(await prisma.wikiIngestJob.count({ where: { vaultId } })).toBe(0);
  });

  it("listVaults filters by agentId + shared", async () => {
    await createVault({ name: "专属库", agentId: AGENT_ID });
    await createVault({ name: "共享库", isShared: true });

    const byAgent = await listVaults({ skip: 0, take: 100, agentId: AGENT_ID });
    expect(byAgent.total).toBe(1);
    expect(byAgent.items.every((v) => v.agentId === AGENT_ID)).toBe(true);

    const shared = await listVaults({ skip: 0, take: 100, shared: true });
    expect(shared.items.every((v) => v.isShared === true)).toBe(true);
  });
});

describe("page CRUD", () => {
  it("createPage throws NotFoundError for missing vault", async () => {
    await expect(
      createPage({ vaultId: "ghost", title: "t", slug: "s", content: "c" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("createPage rejects duplicate slug in vault (409)", async () => {
    await createPage({ vaultId, title: "第一页", slug: "dup-slug", content: "c" });
    await expect(
      createPage({ vaultId, title: "第二页", slug: "dup-slug", content: "c2" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("createPage + getPage (vault 摘要) + audit", async () => {
    const p = (await createPage({
      vaultId,
      title: "新页面",
      slug: "new-page",
      content: "内容",
      tier: "CORE",
    })) as Record<string, unknown>;
    expect(p.title).toBe("新页面");
    expect(p.tier).toBe("CORE");
    expect(p.lifecycle).toBe("DRAFT");
    expect(p.filePath).toBe("new-page.md");

    const got = await getPage(p.id as string);
    expect(got).not.toBeNull();
    expect((got as Record<string, unknown>).vault).toEqual({ id: vaultId, name: "测试库" });

    await flushAudit();
    const audits = await listAudit({ action: "wiki.page.create", resourceId: p.id as string });
    expect(audits.length).toBeGreaterThan(0);
  });

  it("updatePage + deletePage", async () => {
    const p = (await createPage({ vaultId, title: "t", slug: "s", content: "c" })) as Record<string, unknown>;
    const updated = (await updatePage(p.id as string, { title: "改" })) as Record<string, unknown>;
    expect(updated.title).toBe("改");
    const deleted = await deletePage(p.id as string);
    expect(deleted).toEqual({ deleted: true });
    expect(await getPage(p.id as string)).toBeNull();
  });

  it("updatePage / deletePage throw NotFoundError for missing", async () => {
    await expect(updatePage("ghost", {})).rejects.toBeInstanceOf(NotFoundError);
    await expect(deletePage("ghost")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("listPages filters lifecycle/tier/tag + ALL 豁免", async () => {
    await createPage({ vaultId, title: "SSH 指南", slug: "ssh", content: "SSH 排查", tags: ["SSH"] });
    await createPage({ vaultId, title: "OSS 教程", slug: "oss", content: "OSS 操作", tags: ["OSS"] });
    await prisma.wikiPage.updateMany({ where: { slug: "ssh" }, data: { lifecycle: "VERIFIED" } });

    const all = await listPages({ vaultId, skip: 0, take: 100, lifecycle: "ALL" });
    expect(all.total).toBe(2);

    const verified = await listPages({ vaultId, skip: 0, take: 100, lifecycle: "VERIFIED" });
    expect(verified.total).toBe(1);
    expect(verified.items.every((p) => p.lifecycle === "VERIFIED")).toBe(true);

    const tagged = await listPages({ vaultId, skip: 0, take: 100, tag: "SSH" });
    expect(tagged.items.map((p) => p.slug)).toEqual(["ssh"]);
  });

  it("listPages search matches title/content case-insensitively", async () => {
    await createPage({ vaultId, title: "SSH 指南", slug: "ssh", content: "安全组 22 端口" });
    await createPage({ vaultId, title: "OSS 教程", slug: "oss", content: "Bucket" });

    const byTitle = await listPages({ vaultId, skip: 0, take: 100, search: "ssh" });
    expect(byTitle.items.map((p) => p.slug)).toEqual(["ssh"]);

    const byContent = await listPages({ vaultId, skip: 0, take: 100, search: "bucket" });
    expect(byContent.items.map((p) => p.slug)).toEqual(["oss"]);
  });

  it("listPages paginates", async () => {
    for (let i = 0; i < 5; i++) {
      await createPage({ vaultId, title: `页 ${i}`, slug: `p-${i}`, content: "c" });
    }
    const page1 = await listPages({ vaultId, skip: 0, take: 2 });
    expect(page1.total).toBe(5);
    expect(page1.items).toHaveLength(2);
    const page3 = await listPages({ vaultId, skip: 4, take: 2 });
    expect(page3.items).toHaveLength(1);
  });

  it("listPages returns empty for missing vault", async () => {
    const result = await listPages({ vaultId: "ghost-vault", skip: 0, take: 100 });
    expect(result).toEqual({ items: [], total: 0 });
  });
});
