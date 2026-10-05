import { prisma, unpackJsonArray, unpackJson } from "@agent-up/db";
import type { FeedbackStatus } from "@agent-up/db";
import { success } from "@/lib/utils";

const PENDING_FEEDBACK_STATUSES: FeedbackStatus[] = [
  "NEW",
  "TRIAGED",
  "ASSIGNED",
  "IN_PROGRESS",
];

export async function GET() {
  const [
    totalAgents,
    activeAgents,
    totalFeedback,
    pendingFeedback,
    pendingReleases,
    recentFeedbackRows,
    recentReleaseRows,
  ] = await Promise.all([
    prisma.agent.count(),
    prisma.agent.count({ where: { status: "ACTIVE" } }),
    prisma.feedback.count(),
    prisma.feedback.count({ where: { status: { in: PENDING_FEEDBACK_STATUSES } } }),
    prisma.release.count({ where: { status: "PENDING" } }),
    prisma.feedback.findMany({
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: 5,
      include: { agent: { select: { id: true, name: true } } },
    }),
    prisma.release.findMany({
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: 5,
      include: { agent: { select: { id: true, name: true } } },
    }),
  ]);

  // JSON 文本列（tags/sessionData/configSnapshot/aiReview/changedPartitions）
  // 先还原为对象/数组，保持与迁移前完全一致的响应形状
  const recentFeedback = recentFeedbackRows.map((row) => ({
    ...row,
    tags: unpackJsonArray<string>(row.tags, []),
    sessionData: unpackJson<unknown>(row.sessionData, null),
  }));
  const recentReleases = recentReleaseRows.map((row) => ({
    ...row,
    changedPartitions: unpackJsonArray<string>(row.changedPartitions, []),
    configSnapshot: unpackJson<unknown>(row.configSnapshot, null),
    aiReview: unpackJson<unknown>(row.aiReview, null),
  }));

  return success({
    agents: { total: totalAgents, active: activeAgents },
    feedback: { total: totalFeedback, pending: pendingFeedback },
    releases: { pending: pendingReleases },
    recentFeedback,
    recentReleases,
  });
}
