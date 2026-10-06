import {
  prisma,
  packJson,
  unpackJsonArray,
  type Provenance,
  type PageLifecycle,
  type PageTier,
  type Prisma,
} from "@agent-up/db";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { requirePermission } from "@/lib/services/rbac";
import { recordAudit } from "@/lib/services/audit-service";

const AGENT_SELECT = { id: true, name: true } as const;
const VAULT_COUNT_INCLUDE = { _count: { select: { pages: true, ingestJobs: true } } } as const;
const VAULT_INCLUDE = { ...VAULT_COUNT_INCLUDE, agent: { select: AGENT_SELECT } } as const;

type VaultWithCount = Prisma.WikiVaultGetPayload<{ include: typeof VAULT_INCLUDE }>;

function toVaultResponse(row: VaultWithCount) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    agentId: row.agentId,
    isShared: row.isShared,
    gitRepoUrl: row.gitRepoUrl,
    gitBranch: row.gitBranch,
    pageCount: row.pageCount,
    avgConfidence: row.avgConfidence,
    orphanCount: row.orphanCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    _count: { pages: row._count.pages, ingestJobs: row._count.ingestJobs },
    agent: row.agent ? { id: row.agent.id, name: row.agent.name } : null,
  };
}

/** 旧 JSON 契约：sourceRefs 为数组、inbound/outboundLinks 为数组（PG 模型存计数，公开响应保持旧形态） */
function toPageResponse(row: Prisma.WikiPageGetPayload<Record<string, never>>) {
  return {
    id: row.id,
    vaultId: row.vaultId,
    title: row.title,
    slug: row.slug,
    content: row.content,
    summary: row.summary,
    provenance: row.provenance,
    lifecycle: row.lifecycle,
    tier: row.tier,
    baseConfidence: row.baseConfidence,
    tags: unpackJsonArray<string>(row.tags, []),
    categories: unpackJsonArray<string>(row.categories, []),
    wikilinks: unpackJsonArray<string>(row.wikilinks, []),
    filePath: row.filePath,
    sourceRefs: unpackJsonArray<unknown>(row.sourceRefs, []),
    inboundLinks: [] as unknown[],
    outboundLinks: [] as unknown[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
  };
}

export async function listVaults(params: {
  skip: number;
  take: number;
  agentId?: string;
  shared?: boolean;
}) {
  const where: Prisma.WikiVaultWhereInput = {
    ...(params.agentId && { agentId: params.agentId }),
    ...(params.shared !== undefined && { isShared: params.shared }),
  };
  const [rows, total] = await Promise.all([
    prisma.wikiVault.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: params.skip,
      take: params.take,
      include: VAULT_INCLUDE,
    }),
    prisma.wikiVault.count({ where }),
  ]);
  return { items: rows.map(toVaultResponse), total };
}

export async function getVault(id: string) {
  const vault = await prisma.wikiVault.findUnique({
    where: { id },
    include: { ...VAULT_COUNT_INCLUDE, agent: { select: AGENT_SELECT } },
  });
  return vault ? toVaultResponse(vault) : null;
}

export async function createVault(data: {
  name: string;
  description?: string;
  agentId?: string | null;
  gitRepoUrl?: string | null;
  gitBranch?: string;
  isShared?: boolean;
}) {
  await requirePermission("wiki", "write");
  const created = await prisma.wikiVault.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      agentId: data.agentId ?? null,
      gitRepoUrl: data.gitRepoUrl || null,
      gitBranch: data.gitBranch ?? "main",
      isShared: data.isShared ?? false,
    },
    include: { ...VAULT_COUNT_INCLUDE, agent: { select: AGENT_SELECT } },
  });

  recordAudit("wiki.vault.create", "wiki-vault", created.id, { name: data.name });
  return toVaultResponse(created);
}

export async function updateVault(id: string, data: Record<string, unknown>) {
  await requirePermission("wiki", "write");
  const existing = await prisma.wikiVault.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Vault 不存在");

  const updated = await prisma.wikiVault.update({
    where: { id },
    data: data as Prisma.WikiVaultUpdateInput,
    include: { ...VAULT_COUNT_INCLUDE, agent: { select: AGENT_SELECT } },
  });
  recordAudit("wiki.vault.update", "wiki-vault", id);
  return toVaultResponse(updated);
}

export async function deleteVault(id: string) {
  await requirePermission("wiki", "write");
  const existing = await prisma.wikiVault.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Vault 不存在");

  // FK ON DELETE CASCADE：pages + ingestJobs 随库一起消失（对齐旧 fs 递归删目录语义）
  await prisma.wikiVault.delete({ where: { id } });
  recordAudit("wiki.vault.delete", "wiki-vault", id);
  return { deleted: true };
}

export async function listPages(params: {
  vaultId: string;
  skip: number;
  take: number;
  lifecycle?: string;
  tier?: string;
  tag?: string;
  search?: string;
}) {
  const where: Prisma.WikiPageWhereInput = {
    vaultId: params.vaultId,
    ...(params.lifecycle && params.lifecycle !== "ALL" && { lifecycle: params.lifecycle as PageLifecycle }),
    ...(params.tier && params.tier !== "ALL" && { tier: params.tier as PageTier }),
  };

  // SQLite 无标量列表 has 过滤与 insensitive 搜索（tags 已是 JSON 文本列）：
  // 标签过滤与关键字搜索取数后内存做，total 取过滤后口径（演示规模足够）
  if (params.tag || params.search) {
    const q = params.search?.toLowerCase();
    const all = await prisma.wikiPage.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    const filtered = all.filter((row) => {
      if (params.tag && !unpackJsonArray<string>(row.tags, []).includes(params.tag))
        return false;
      if (
        q &&
        !(
          row.title.toLowerCase().includes(q) ||
          row.content.toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
    const items = filtered.slice(params.skip, params.skip + params.take);
    return { items: items.map(toPageResponse), total: filtered.length };
  }

  const [rows, total] = await Promise.all([
    prisma.wikiPage.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: params.skip,
      take: params.take,
    }),
    prisma.wikiPage.count({ where }),
  ]);
  return { items: rows.map(toPageResponse), total };
}

export async function getPage(id: string) {
  const page = await prisma.wikiPage.findUnique({
    where: { id },
    include: { vault: { select: AGENT_SELECT } },
  });
  if (!page) return null;

  return {
    ...toPageResponse(page),
    vault: { id: page.vault.id, name: page.vault.name },
  };
}

export async function createPage(data: {
  vaultId: string;
  title: string;
  slug: string;
  content: string;
  summary?: string;
  provenance?: string;
  lifecycle?: string;
  tier?: string;
  baseConfidence?: number;
  tags?: string[];
  categories?: string[];
  wikilinks?: string[];
}) {
  await requirePermission("wiki", "write");
  const vault = await prisma.wikiVault.findUnique({ where: { id: data.vaultId }, select: { id: true } });
  if (!vault) throw new NotFoundError("Vault 不存在");

  const slugDup = await prisma.wikiPage.findUnique({
    where: { vaultId_slug: { vaultId: data.vaultId, slug: data.slug } },
    select: { id: true },
  });
  if (slugDup) throw new ConflictError("同库下已存在相同 slug 的页面");

  const created = await prisma.wikiPage.create({
    data: {
      vaultId: data.vaultId,
      title: data.title,
      slug: data.slug,
      content: data.content,
      summary: data.summary ?? null,
      provenance: (data.provenance ?? "EXTRACTED") as Provenance,
      lifecycle: (data.lifecycle ?? "DRAFT") as PageLifecycle,
      tier: (data.tier ?? "SPECIALIZED") as PageTier,
      baseConfidence: data.baseConfidence ?? 0.5,
      tags: packJson(data.tags ?? []) ?? "[]",
      categories: packJson(data.categories ?? []) ?? "[]",
      wikilinks: packJson(data.wikilinks ?? []) ?? "[]",
      filePath: `${data.slug}.md`,
      sourceRefs: packJson([]) ?? "[]",
    },
  });

  recordAudit("wiki.page.create", "wiki-page", created.id, {
    vaultId: data.vaultId,
    title: data.title,
  });
  return toPageResponse(created);
}

export async function updatePage(id: string, data: Record<string, unknown>) {
  await requirePermission("wiki", "write");
  const existing = await prisma.wikiPage.findUnique({
    where: { id },
    select: { id: true, vaultId: true, title: true },
  });
  if (!existing) throw new NotFoundError("Page 不存在");

  // 原 Json/数组列现为 String：调用方传对象/数组时先序列化（undefined 交由 Prisma 跳过）
  const payload = { ...data };
  for (const key of ["tags", "categories", "wikilinks", "sourceRefs"] as const) {
    if (payload[key] !== undefined) payload[key] = packJson(payload[key]) ?? "[]";
  }

  const updated = await prisma.wikiPage.update({
    where: { id },
    data: payload as Prisma.WikiPageUpdateInput,
  });
  recordAudit("wiki.page.update", "wiki-page", id, {
    vaultId: existing.vaultId,
    title: updated.title,
  });
  return toPageResponse(updated);
}

export async function deletePage(id: string) {
  await requirePermission("wiki", "write");
  const existing = await prisma.wikiPage.findUnique({
    where: { id },
    select: { id: true, vaultId: true },
  });
  if (!existing) throw new NotFoundError("Page 不存在");

  await prisma.wikiPage.delete({ where: { id } });
  recordAudit("wiki.page.delete", "wiki-page", id, { vaultId: existing.vaultId });
  return { deleted: true };
}
