import { store } from "@/lib/data/store";
import { existsSync, readdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { NotFoundError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit-service";

export async function listVaults(params: {
  skip: number;
  take: number;
  agentId?: string;
  shared?: boolean;
}) {
  return store.queryList<Record<string, unknown>>(
    ["wiki-vaults"],
    {
      ...(params.agentId && { agentId: (v) => v.agentId === params.agentId }),
      ...(params.shared !== undefined && { shared: (v) => v.isShared === params.shared }),
    },
    (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
    params.skip,
    params.take,
  );
}

export async function getVault(id: string) {
  return store.read<Record<string, unknown>>("wiki-vaults", `${id}.json`);
}

export async function createVault(data: {
  name: string;
  description?: string;
  agentId?: string | null;
  gitRepoUrl?: string | null;
  gitBranch?: string;
  isShared?: boolean;
}) {
  const id = store.generateId();
  const ts = store.now();
  const vault = {
    id,
    name: data.name,
    description: data.description ?? null,
    agentId: data.agentId ?? null,
    isShared: data.isShared ?? false,
    gitRepoUrl: data.gitRepoUrl || null,
    gitBranch: data.gitBranch ?? "main",
    pageCount: 0,
    avgConfidence: 0,
    orphanCount: 0,
    createdAt: ts,
    updatedAt: ts,
    _count: { pages: 0, ingestJobs: 0 },
    agent: null,
  };

  store.write(vault, "wiki-vaults", `${id}.json`);
  store.ensureDir("wiki-vaults", id, "pages");
  recordAudit("wiki.vault.create", "wiki-vault", id, { name: data.name });
  return vault;
}

export async function updateVault(id: string, data: Record<string, unknown>) {
  const vault = store.read<Record<string, unknown>>("wiki-vaults", `${id}.json`);
  if (!vault) throw new NotFoundError("Vault 不存在");

  const updated = { ...vault, ...data, updatedAt: store.now() };
  store.write(updated, "wiki-vaults", `${id}.json`);
  recordAudit("wiki.vault.update", "wiki-vault", id);
  return updated;
}

export async function deleteVault(id: string) {
  const vault = store.read("wiki-vaults", `${id}.json`);
  if (!vault) throw new NotFoundError("Vault 不存在");

  const pagesDir = join(process.cwd(), "data", "wiki-vaults", id, "pages");
  if (existsSync(pagesDir)) rmSync(pagesDir, { recursive: true });

  const vaultDir = join(process.cwd(), "data", "wiki-vaults", id);
  if (existsSync(vaultDir)) rmSync(vaultDir, { recursive: true });

  store.delete("wiki-vaults", `${id}.json`);
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
  const pagesDir = join(process.cwd(), "data", "wiki-vaults", params.vaultId, "pages");
  if (!existsSync(pagesDir)) return { items: [], total: 0 };

  let items = readdirSync(pagesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const content = readFileSync(join(pagesDir, f), "utf-8");
      try {
        return JSON.parse(content) as Record<string, unknown>;
      } catch {
        throw new Error(`数据文件损坏：wiki-vaults/${params.vaultId}/pages/${f}`);
      }
    });

  if (params.lifecycle && params.lifecycle !== "ALL") {
    items = items.filter((p) => p.lifecycle === params.lifecycle);
  }
  if (params.tier && params.tier !== "ALL") {
    items = items.filter((p) => p.tier === params.tier);
  }
  if (params.tag) {
    items = items.filter((p) => Array.isArray(p.tags) && (p.tags as string[]).includes(params.tag!));
  }
  if (params.search) {
    const q = params.search.toLowerCase();
    items = items.filter((p) =>
      String(p.title ?? "").toLowerCase().includes(q) ||
      String(p.content ?? "").toLowerCase().includes(q)
    );
  }

  items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const total = items.length;
  items = items.slice(params.skip, params.skip + params.take);
  return { items, total };
}

export async function getPage(id: string) {
  const vaults = store.list<Record<string, unknown>>("wiki-vaults");
  for (const vault of vaults) {
    const page = store.read<Record<string, unknown>>("wiki-vaults", String(vault.id), "pages", `${id}.json`);
    if (page) {
      return { ...page, vault: { id: vault.id, name: vault.name } };
    }
  }
  return null;
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
  const vault = store.read("wiki-vaults", `${data.vaultId}.json`);
  if (!vault) throw new NotFoundError("Vault 不存在");

  const id = store.generateId();
  const ts = store.now();
  const page = {
    id,
    vaultId: data.vaultId,
    title: data.title,
    slug: data.slug,
    content: data.content,
    summary: data.summary ?? null,
    provenance: data.provenance ?? "EXTRACTED",
    lifecycle: data.lifecycle ?? "DRAFT",
    tier: data.tier ?? "SPECIALIZED",
    baseConfidence: data.baseConfidence ?? 0.5,
    tags: data.tags ?? [],
    categories: data.categories ?? [],
    wikilinks: data.wikilinks ?? [],
    filePath: `${data.slug}.md`,
    sourceRefs: [],
    inboundLinks: [],
    outboundLinks: [],
    createdAt: ts,
    updatedAt: ts,
    reviewedAt: null,
  };

  store.write(page, "wiki-vaults", data.vaultId, "pages", `${id}.json`);
  recordAudit("wiki.page.create", "wiki-page", id, {
    vaultId: data.vaultId,
    title: data.title,
  });
  return page;
}

export async function updatePage(id: string, data: Record<string, unknown>) {
  const vaults = store.list<Record<string, unknown>>("wiki-vaults");
  for (const vault of vaults) {
    const page = store.read<Record<string, unknown>>("wiki-vaults", String(vault.id), "pages", `${id}.json`);
    if (page) {
      const updated: Record<string, unknown> = { ...page, ...data, updatedAt: store.now() };
      store.write(updated, "wiki-vaults", String(vault.id), "pages", `${id}.json`);
      recordAudit("wiki.page.update", "wiki-page", id, {
        vaultId: vault.id,
        title: updated.title,
      });
      return updated;
    }
  }
  throw new NotFoundError("Page 不存在");
}

export async function deletePage(id: string) {
  const vaults = store.list<Record<string, unknown>>("wiki-vaults");
  for (const vault of vaults) {
    const page = store.read<Record<string, unknown>>("wiki-vaults", String(vault.id), "pages", `${id}.json`);
    if (page) {
      store.delete("wiki-vaults", String(vault.id), "pages", `${id}.json`);
      recordAudit("wiki.page.delete", "wiki-page", id, { vaultId: vault.id });
      return { deleted: true };
    }
  }
  throw new NotFoundError("Page 不存在");
}
