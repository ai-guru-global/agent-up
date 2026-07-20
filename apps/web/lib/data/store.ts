import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");

function ensureDir(...segments: string[]) {
  const dir = join(DATA_DIR, ...segments);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson<T>(...pathSegments: string[]): T | null {
  const filePath = join(DATA_DIR, ...pathSegments);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function writeJson<T>(data: T, ...pathSegments: string[]) {
  const dir = join(DATA_DIR, ...pathSegments.slice(0, -1));
  ensureDir(...pathSegments.slice(0, -1));
  writeFileSync(join(DATA_DIR, ...pathSegments), JSON.stringify(data, null, 2), "utf-8");
}

function listJson<T>(...segments: string[]): T[] {
  const dir = join(DATA_DIR, ...segments);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const content = readFileSync(join(dir, f), "utf-8");
      return JSON.parse(content) as T;
    });
}

function deleteJson(...pathSegments: string[]): boolean {
  const filePath = join(DATA_DIR, ...pathSegments);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  return true;
}

export interface StoreEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export function now(): string {
  return new Date().toISOString();
}

export interface ListResult<T> {
  items: T[];
  total: number;
}

export function queryList<T extends Record<string, unknown>>(
  segments: string[],
  filters: Record<string, (item: T) => boolean>,
  sort: (a: T, b: T) => number,
  skip: number,
  take: number
): ListResult<T> {
  let items = listJson<T>(...segments);
  for (const [, filterFn] of Object.entries(filters)) {
    items = items.filter(filterFn);
  }
  items.sort(sort);
  const total = items.length;
  items = items.slice(skip, skip + take);
  return { items, total };
}

function readArray<T>(...pathSegments: string[]): T[] {
  const filePath = join(DATA_DIR, ...pathSegments);
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(content);
  return Array.isArray(parsed) ? parsed as T[] : [];
}

function writeArray<T>(data: T[], ...pathSegments: string[]) {
  const dir = join(DATA_DIR, ...pathSegments.slice(0, -1));
  ensureDir(...pathSegments.slice(0, -1));
  writeFileSync(join(DATA_DIR, ...pathSegments), JSON.stringify(data, null, 2), "utf-8");
}

export const store = {
  read: readJson,
  write: writeJson,
  list: listJson,
  delete: deleteJson,
  readArray,
  writeArray,
  ensureDir,
  generateId,
  now,
  queryList,
};
