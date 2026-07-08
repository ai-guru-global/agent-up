import { prisma } from "@agent-up/db";
import { success } from "@/lib/utils";

/** GET /api/dashboard — 工作台统计数据 */
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
    prisma.feedback.count({ where: { status: { in: ["NEW", "TRIAGED", "ASSIGNED", "IN_PROGRESS"] } } }),
    prisma.release.count({ where: { status: "PENDING" } }),
    prisma.feedback.findMany({
      take: 5,
      orderBy: { submittedAt: "desc" },
      include: { agent: { select: { id: true, name: true } } },
    }),
    prisma.release.findMany({
      take: 5,
      orderBy: { submittedAt: "desc" },
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
