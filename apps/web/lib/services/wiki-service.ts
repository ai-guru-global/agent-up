/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "@agent-up/db";

interface ListVaultsParams {
  skip: number;
  take: number;
  agentId?: string;
  shared?: boolean;
}

export async function listVaults(params: ListVaultsParams) {
  const where: Record<string, unknown> = {};
  if (params.agentId) where.agentId = params.agentId;
  if (params.shared !== undefined) where.isShared = params.shared;

  const [items, total] = await Promise.all([
    prisma.wikiVault.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy: { updatedAt: "desc" },
      include: {
        agent: { select: { id: true, name: true } },
        _count: { select: { pages: true, ingestJobs: true } },
      },
    }),
    prisma.wikiVault.count({ where }),
  ]);

  return { items, total };
}

export async function getVault(id: string) {
  return prisma.wikiVault.findUnique({
    where: { id },
    include: {
      agent: { select: { id: true, name: true } },
      _count: { select: { pages: true, ingestJobs: true } },
    },
  });
}

export async function createVault(data: {
  name: string;
  description?: string;
  agentId?: string;
  gitRepoUrl?: string;
  gitBranch?: string;
}) {
  return prisma.wikiVault.create({
    data: {
      name: data.name,
      description: data.description,
      agentId: data.agentId,
      gitRepoUrl: data.gitRepoUrl,
      gitBranch: data.gitBranch ?? "main",
    },
  });
}

export async function updateVault(id: string, data: Record<string, any>) {
  return prisma.wikiVault.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.gitRepoUrl !== undefined && { gitRepoUrl: data.gitRepoUrl }),
      ...(data.gitBranch !== undefined && { gitBranch: data.gitBranch }),
      ...(data.isShared !== undefined && { isShared: data.isShared }),
    },
  });
}

export async function deleteVault(id: string) {
  // Delete all pages and jobs first, then vault
  await prisma.wikiPage.deleteMany({ where: { vaultId: id } });
  await prisma.wikiIngestJob.deleteMany({ where: { vaultId: id } });
  return prisma.wikiVault.delete({ where: { id } });
}

// ---- Wiki Pages ----

interface ListPagesParams {
  vaultId: string;
  skip: number;
  take: number;
  lifecycle?: string;
  tier?: string;
  tag?: string;
  search?: string;
}

export async function listPages(params: ListPagesParams) {
  const where: Record<string, unknown> = { vaultId: params.vaultId };
  if (params.lifecycle && params.lifecycle !== "ALL") where.lifecycle = params.lifecycle;
  if (params.tier && params.tier !== "ALL") where.tier = params.tier;
  if (params.tag) where.tags = { has: params.tag };
  if (params.search) {
    where.OR = [
      { title: { contains: params.search, mode: "insensitive" } },
      { content: { contains: params.search, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.wikiPage.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, title: true, slug: true, summary: true,
        provenance: true, lifecycle: true, tier: true,
        baseConfidence: true, tags: true, categories: true,
        wikilinks: true, filePath: true,
        inboundLinks: true, outboundLinks: true,
        updatedAt: true, reviewedAt: true,
      },
    }),
    prisma.wikiPage.count({ where }),
  ]);

  return { items, total };
}

export async function getPage(id: string) {
  return prisma.wikiPage.findUnique({
    where: { id },
    include: { vault: { select: { id: true, name: true } } },
  });
}

export async function createPage(data: {
  vaultId: string;
  title: string;
  slug: string;
  content: string;
  summary?: string;
  provenance?: string;
  tier?: string;
  tags?: string[];
  categories?: string[];
  filePath?: string;
}) {
  return prisma.wikiPage.create({
    data: {
      vaultId: data.vaultId,
      title: data.title,
      slug: data.slug,
      content: data.content,
      summary: data.summary,
      provenance: (data.provenance ?? "EXTRACTED") as any,
      tier: (data.tier ?? "SUPPORTING") as any,
      tags: (data.tags ?? []) as any,
      categories: (data.categories ?? []) as any,
      filePath: data.filePath ?? `${data.slug}.md`,
      sourceRefs: [] as any,
      wikilinks: [],
    },
  });
}

export async function updatePage(id: string, data: Record<string, any>) {
  return prisma.wikiPage.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.content !== undefined && { content: data.content }),
      ...(data.summary !== undefined && { summary: data.summary }),
      ...(data.lifecycle !== undefined && { lifecycle: data.lifecycle }),
      ...(data.tier !== undefined && { tier: data.tier }),
      ...(data.baseConfidence !== undefined && { baseConfidence: data.baseConfidence }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.categories !== undefined && { categories: data.categories }),
      ...(data.wikilinks !== undefined && { wikilinks: data.wikilinks }),
    },
  });
}

export async function deletePage(id: string) {
  return prisma.wikiPage.delete({ where: { id } });
}
