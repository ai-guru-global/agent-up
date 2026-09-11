import { prisma, Prisma } from "@agent-up/db";
import { recordAudit } from "@/lib/services/audit-service";

/**
 * 版本效果报告（Effectiveness Report）。
 *
 * 在 version 发布 N 天后,自动汇总该版本上线期间产生的 feedback,
 * 生成一份「这个版本效果如何」的结构化报告,写入 version.effectivenessReport。
 *
 * 设计取舍：
 * - **Lazy fill(懒填)**:不引入 cron / 定时任务,API 层 GET version 时若发现
 *   publishedAt 距今 ≥ windowDays 且 effectivenessReport 为空,则现场计算并写回。
 *   优点:零运维,缺点:第一次读会触发计算(可接受,版本历史页面访问频率低)。
 * - **幂等**:写回后下次 GET 直接读,不再算。多个并发 GET 靠 store.write 的
 *   「全量覆盖」语义,最后写入的胜出(因为纯函数,输出相同,无副作用差)。
 * - **窗口**:默认 7 天(`DEFAULT_WINDOW_DAYS`),覆盖版本上线一周后的效果窗口。
 *   未到窗口返回 null(效果数据还不足以做判断)。
 *
 * 字段:
 * - totalFeedbacks:窗口内 feedback 总数
 * - byRating:按评价聚合(POSITIVE/NEGATIVE/NEUTRAL)
 * - bySeverity:按严重度聚合(CRITICAL/MAJOR/MINOR/SUGGESTION)
 * - byPartition:按目标分区聚合(PROMPT/KNOWLEDGE/TOOLS/ROUTING)
 * - computedAt:本次计算时间
 * - versionPublishedAt:version 的发布时间
 * - windowDays:计算窗口
 */

export const DEFAULT_WINDOW_DAYS = 7;

export interface EffectivenessReport {
  totalFeedbacks: number;
  byRating: { POSITIVE: number; NEGATIVE: number; NEUTRAL: number };
  bySeverity: { CRITICAL: number; MAJOR: number; MINOR: number; SUGGESTION: number };
  byPartition: { PROMPT: number; KNOWLEDGE: number; TOOLS: number; ROUTING: number };
  computedAt: string;
  versionPublishedAt: string;
  windowDays: number;
}

interface VersionLike {
  id: string;
  agentId: string;
  publishedAt: string | Date;
  /** 幂等短路用：PG 行是 JsonValue，纯测试传真实对象，这里保持宽类型 */
  effectivenessReport?: unknown;
}

interface FeedbackLike {
  agentId: string;
  rating: string;
  severity: string;
  targetPartition: string | null;
  submittedAt: string | Date;
}

const ZERO_RATINGS: EffectivenessReport["byRating"] = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 };
const ZERO_SEVERITIES: EffectivenessReport["bySeverity"] = {
  CRITICAL: 0,
  MAJOR: 0,
  MINOR: 0,
  SUGGESTION: 0,
};
const ZERO_PARTITIONS: EffectivenessReport["byPartition"] = {
  PROMPT: 0,
  KNOWLEDGE: 0,
  TOOLS: 0,
  ROUTING: 0,
};

/**
 * 纯函数：给定 version + window + now,计算效果报告。
 * 不读 store,不写副作用,纯计算。便于单测。
 *
 * @param version 目标 version（含 publishedAt）
 * @param allFeedbacks 该 agent 的所有 feedback（调用方过滤）
 * @param options.windowDays 窗口天数
 * @param options.now 时间基准(测试可注入)
 */
export function computeEffectivenessReport(
  version: VersionLike,
  allFeedbacks: FeedbackLike[],
  options: { windowDays?: number; now?: Date } = {},
): EffectivenessReport {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const now = options.now ?? new Date();
  const publishedIso =
    version.publishedAt instanceof Date ? version.publishedAt.toISOString() : version.publishedAt;
  const publishedAt = new Date(publishedIso);
  const windowEnd = new Date(publishedAt);
  windowEnd.setDate(windowEnd.getDate() + windowDays);

  // 窗口内 feedback：publishedAt <= submittedAt <= windowEnd
  const inWindow = allFeedbacks.filter((f) => {
    if (f.agentId !== version.agentId) return false;
    const submitted = new Date(f.submittedAt);
    return submitted >= publishedAt && submitted <= windowEnd;
  });

  const byRating = { ...ZERO_RATINGS };
  const bySeverity = { ...ZERO_SEVERITIES };
  const byPartition = { ...ZERO_PARTITIONS };

  for (const f of inWindow) {
    if (f.rating in byRating) {
      (byRating as Record<string, number>)[f.rating]++;
    }
    if (f.severity in bySeverity) {
      (bySeverity as Record<string, number>)[f.severity]++;
    }
    if (f.targetPartition && f.targetPartition in byPartition) {
      (byPartition as Record<string, number>)[f.targetPartition]++;
    }
  }

  return {
    totalFeedbacks: inWindow.length,
    byRating,
    bySeverity,
    byPartition,
    computedAt: now.toISOString(),
    versionPublishedAt: publishedIso,
    windowDays,
  };
}

/**
 * 读取 version,若 effectivenessReport 缺失且已过窗口则计算并写回。
 * 幂等:已存在则直接返回;并发场景下先 refetch PG,避免重复算。
 *
 * @returns EffectivenessReport 或 null（未到窗口 / 缺 version）
 */
export async function getOrComputeEffectivenessReport(
  versionIn: VersionLike,
  options: { windowDays?: number; now?: Date } = {},
): Promise<EffectivenessReport | null> {
  // 先 refetch PG 拿到最新 — 解决「同 test 内连续两次调用导致重复算」+ 并发竞态
  const onDisk = await prisma.agentVersion.findUnique({ where: { id: versionIn.id } });
  const version: VersionLike = onDisk
    ? {
        id: onDisk.id,
        agentId: onDisk.agentId,
        publishedAt: onDisk.publishedAt,
        effectivenessReport: onDisk.effectivenessReport ?? null,
      }
    : versionIn;

  // 已存在 → 直接返回
  const existing = version.effectivenessReport as EffectivenessReport | null | undefined;
  if (existing) return existing;

  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const now = options.now ?? new Date();
  const publishedAt = new Date(version.publishedAt);
  const elapsedMs = now.getTime() - publishedAt.getTime();
  const windowMs = windowDays * 24 * 3600 * 1000;

  // 未到窗口 → 不算
  if (elapsedMs < windowMs) return null;

  // 读该 agent 的所有 feedback
  const allFeedbacks = await prisma.feedback.findMany({
    where: { agentId: version.agentId },
  });

  const report = computeEffectivenessReport(version, allFeedbacks, { windowDays, now });

  // 写回 version（含 effectivenessReport）,保证下次直接读
  if (onDisk) {
    await prisma.agentVersion.update({
      where: { id: onDisk.id },
      data: { effectivenessReport: report as unknown as Prisma.InputJsonValue },
    });
    recordAudit("version.effectiveness.computed", "version", version.id, {
      agentId: version.agentId,
      totalFeedbacks: report.totalFeedbacks,
      windowDays,
    });
  }

  return report;
}
