import { store } from "@/lib/data/store";
import { existsSync, readdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";

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
  agentId?: string;
  gitRepoUrl?: string;
  gitBranch?: string;
}) {
  const id = store.generateId();
  const ts = store.now();
  const vault = {
    id,
    name: data.name,
    description: data.description ?? null,
    agentId: data.agentId ?? null,
    isShared: false,
    gitRepoUrl: data.gitRepoUrl ?? null,
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
  return vault;
}

export async function updateVault(id: string, data: Record<string, unknown>) {
  const vault = store.read<Record<string, unknown>>("wiki-vaults", `${id}.json`);
  if (!vault) throw new Error("Vault 不存在");

  const updated = { ...vault, ...data, updatedAt: store.now() };
  store.write(updated, "wiki-vaults", `${id}.json`);
  return updated;
}

export async function deleteVault(id: string) {
  const vault = store.read("wiki-vaults", `${id}.json`);
  if (!vault) throw new Error("Vault 不存在");

  const pagesDir = join(process.cwd(), "data", "wiki-vaults", id, "pages");
  if (existsSync(pagesDir)) rmSync(pagesDir, { recursive: true });

  const vaultDir = join(process.cwd(), "data", "wiki-vaults", id);
  if (existsSync(vaultDir)) rmSync(vaultDir, { recursive: true });

  store.delete("wiki-vaults", `${id}.json`);
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
    .map((f) => JSON.parse(readFileSync(join(pagesDir, f), "utf-8")) as Record<string, unknown>);

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
  tier?: string;
  tags?: string[];
  categories?: string[];
  filePath?: string;
}) {
  const vault = store.read("wiki-vaults", `${data.vaultId}.json`);
  if (!vault) throw new Error("Vault 不存在");

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
    lifecycle: "DRAFT",
    tier: data.tier ?? "SUPPORTING",
    baseConfidence: 0.5,
    tags: data.tags ?? [],
    categories: data.categories ?? [],
    wikilinks: [],
    filePath: data.filePath ?? `${data.slug}.md`,
    sourceRefs: [],
    inboundLinks: [],
    outboundLinks: [],
    createdAt: ts,
    updatedAt: ts,
    reviewedAt: null,
  };

  store.write(page, "wiki-vaults", data.vaultId, "pages", `${id}.json`);
  return page;
}

export async function updatePage(id: string, data: Record<string, unknown>) {
  const vaults = store.list<Record<string, unknown>>("wiki-vaults");
  for (const vault of vaults) {
    const page = store.read<Record<string, unknown>>("wiki-vaults", String(vault.id), "pages", `${id}.json`);
    if (page) {
      const updated = { ...page, ...data, updatedAt: store.now() };
      store.write(updated, "wiki-vaults", String(vault.id), "pages", `${id}.json`);
      return updated;
    }
  }
  throw new Error("Page 不存在");
}

export async function deletePage(id: string) {
  const vaults = store.list<Record<string, unknown>>("wiki-vaults");
  for (const vault of vaults) {
    const page = store.read("wiki-vaults", String(vault.id), "pages", `${id}.json`);
    if (page) {
      store.delete("wiki-vaults", String(vault.id), "pages", `${id}.json`);
      return { deleted: true };
    }
  }
  throw new Error("Page 不存在");
}
