/**
 * SQLite 迁移配套的 JSON 文本编解码（原 Prisma Json 列的读写收口点）。
 *
 * 背景：Prisma SQLite 连接器不支持 Json 列，这些列已改为 String，存
 * JSON.stringify 产物。所有读写必须经本模块，禁止直接 JSON.parse——
 * 解析失败必须回落 fallback 而不是抛错/返回半成品，否则会出现两类
 * 已知静默故障：diff 计算吃进裸字符串产出空 diff；evidence-chain 的
 * detailOf 遇到非对象静默返回 null。
 */

/** undefined 与 null 都归一为 null（对应可空列的 NULL 语义） */
export function packJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value) as string;
}

/**
 * 解析列中存的 JSON。任何异常（null、非 JSON 文本、解析出 null/非预期标量）
 * 都返回 fallback，绝不抛错——认证失败关闭同一逻辑：坏数据宁可表现成空值，
 * 不能让一个脏行炸掉整个请求。
 */
export function unpackJson<T>(text: string | null | undefined, fallback: T): T {
  if (text === null || text === undefined) return fallback;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed === "undefined") return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

/** 数组列专用：非数组文本一律回落 fallback，防止对象被当数组展开 */
export function unpackJsonArray<T>(text: string | null | undefined, fallback: T[]): T[] {
  const parsed = unpackJson<unknown>(text, fallback);
  return Array.isArray(parsed) ? (parsed as T[]) : fallback;
}
