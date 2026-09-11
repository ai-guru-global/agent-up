import { prisma } from "@agent-up/db";
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
    recentFeedback,
    recentReleases,
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

  return success({
    agents: { total: totalAgents, active: activeAgents },
    feedback: { total: totalFeedback, pending: pendingFeedback },
    releases: { pending: pendingReleases },
    recentFeedback,
    recentReleases,
  });
}
