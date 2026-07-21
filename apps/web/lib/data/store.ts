import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { AppError } from "@/lib/errors";

/**
 * 数据根目录。默认 <cwd>/data。
 * 通过函数解析（而非模块常量），使测试可注入临时目录实现隔离。
 */
let dataDirOverride: string | null = null;

function DATA_DIR(): string {
  return dataDirOverride ?? join(process.cwd(), "data");
}

/** 测试专用：覆盖数据根目录。传 null 恢复默认。 */
export function _setDataDir(dir: string | null): void {
  dataDirOverride = dir;
}

/** 测试专用：读取当前数据根目录（用于直接写损坏文件等场景）。 */
export function _getDataDir(): string {
  return DATA_DIR();
}

function ensureDir(...segments: string[]) {
  const dir = join(DATA_DIR(), ...segments);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 安全读取并解析 JSON。
 * - 文件不存在返回 null（正常路径）
 * - 文件存在但损坏抛结构化 AppError，而非裸 SyntaxError 把请求变 500 且无信息
 */
function readJson<T>(...pathSegments: string[]): T | null {
  const filePath = join(DATA_DIR(), ...pathSegments);
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, "utf-8");
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new AppError(
      `数据文件损坏：${pathSegments.join("/")}`,
      500,
      "INTERNAL",
    );
  }
}

function writeJson<T>(data: T, ...pathSegments: string[]) {
  ensureDir(...pathSegments.slice(0, -1));
  writeFileSync(join(DATA_DIR(), ...pathSegments), JSON.stringify(data, null, 2), "utf-8");
}

function listJson<T>(...segments: string[]): T[] {
  const dir = join(DATA_DIR(), ...segments);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const content = readFileSync(join(dir, f), "utf-8");
      try {
        return JSON.parse(content) as T;
      } catch {
        throw new AppError(
          `数据文件损坏：${[...segments, f].join("/")}`,
          500,
          "INTERNAL",
        );
      }
    });
}

function deleteJson(...pathSegments: string[]): boolean {
  const filePath = join(DATA_DIR(), ...pathSegments);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  return true;
}

export interface StoreEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 生成 ID。使用 crypto.randomUUID（加密强、无碰撞）。
 * 注意：现有种子数据用的是人类可读 slug（如 "ecs-assistant"），
 * 那是初始导入的固定 ID；运行时新建实体一律走本函数。
 */
export function generateId(): string {
  return randomUUID();
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
  const filePath = join(DATA_DIR(), ...pathSegments);
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AppError(
      `数据文件损坏：${pathSegments.join("/")}`,
      500,
      "INTERNAL",
    );
  }
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

function writeArray<T>(data: T[], ...pathSegments: string[]) {
  ensureDir(...pathSegments.slice(0, -1));
  writeFileSync(join(DATA_DIR(), ...pathSegments), JSON.stringify(data, null, 2), "utf-8");
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
