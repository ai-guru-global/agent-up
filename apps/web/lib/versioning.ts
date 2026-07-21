/**
 * 语义化版本（SemVer）计算。
 *
 * 此前 release-service 把 major/patch 硬编码为 0，只递增 minor——
 * 既不符合 SemVer 语义，也无法表达「小修 vs 大改」。
 *
 * 规则（显式、可测、可调）：
 * - 首次发布：0.1.0
 * - ROUTING 分区变更（影响工单路由/转人工阈值，行为面广）：minor
 * - 任意 ≥2 个分区变更：minor
 * - 单个非路由分区变更（Prompt/Knowledge/Tools，影响面相对聚焦）：patch
 * - 同时变更全部 4 个分区：minor（不轻易 major，避免版本号膨胀；
 *   major 留给「破坏性重写」这类人工显式标注，本平台 MVP 不自动 major）
 *
 * 这些规则集中在常量表里，未来要调整只改一处。
 */

export type Partition = "PROMPT" | "KNOWLEDGE" | "TOOLS" | "ROUTING";

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

const FIRST_VERSION: SemVer = { major: 0, minor: 1, patch: 0 };

/** 把 "0.2.0" 解析成 SemVer；非法或空返回 null（=首次发布）。 */
export function parseVersion(v: string | null | undefined): SemVer | null {
  if (!v) return null;
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function formatVersion(v: SemVer): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/**
 * 根据当前最高版本与本次变更的分区集合，计算下一个版本号。
 *
 * @param current 当前最高版本字符串（如 "0.1.0"）；null/非法 = 首次发布
 * @param changedPartitions 本次实际发生变更的分区（已与上一版本 diff 过）
 */
export function bumpVersion(
  current: string | null | undefined,
  changedPartitions: Partition[],
): SemVer {
  const cur = parseVersion(current);
  if (!cur) return { ...FIRST_VERSION };

  // 防御：去重
  const unique = Array.from(new Set(changedPartitions));
  const touchesRouting = unique.includes("ROUTING");
  const count = unique.length;

  if (count === 0) {
    // 没有变更不该走到这；保守起见 patch
    return { major: cur.major, minor: cur.minor, patch: cur.patch + 1 };
  }

  if (count >= 2 || touchesRouting) {
    return { major: cur.major, minor: cur.minor + 1, patch: 0 };
  }

  // 单个非路由分区变更
  return { major: cur.major, minor: cur.minor, patch: cur.patch + 1 };
}
