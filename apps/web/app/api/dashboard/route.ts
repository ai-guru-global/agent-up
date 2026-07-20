import { store } from "@/lib/data/store";
import { success } from "@/lib/utils";

export async function GET() {
  const agents = store.list<Record<string, unknown>>("agents");
  const feedbacks = store.list<Record<string, unknown>>("feedback");
  const releases = store.list<Record<string, unknown>>("releases");

  const totalAgents = agents.length;
  const activeAgents = agents.filter((a) => a.status === "ACTIVE").length;
  const totalFeedback = feedbacks.length;
  const pendingFeedback = feedbacks.filter((f) =>
    ["NEW", "TRIAGED", "ASSIGNED", "IN_PROGRESS"].includes(String(f.status))
  ).length;
  const pendingReleases = releases.filter((r) => r.status === "PENDING").length;

  const recentFeedback = feedbacks
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))
    .slice(0, 5)
    .map((f) => {
      const agent = agents.find((a) => a.id === f.agentId);
      return { ...f, agent: agent ? { id: agent.id, name: agent.name } : null };
    });

  const recentReleases = releases
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))
    .slice(0, 5)
    .map((r) => {
      const agent = agents.find((a) => a.id === r.agentId);
      return { ...r, agent: agent ? { id: agent.id, name: agent.name } : null };
    });

  return success({
    agents: { total: totalAgents, active: activeAgents },
    feedback: { total: totalFeedback, pending: pendingFeedback },
    releases: { pending: pendingReleases },
    recentFeedback,
    recentReleases,
  });
}
