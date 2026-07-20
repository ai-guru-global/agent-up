import { store } from "@/lib/data/store";

function withAgentName<T extends Record<string, unknown>>(item: T): T {
  const agent = store.read<{ id: string; name: string }>("agents", `${item.agentId}.json`);
  return { ...item, agent: agent ? { id: agent.id, name: agent.name } : null };
}

export async function listFeedback(params: {
  skip: number;
  take: number;
  agentId?: string;
  status?: string;
  severity?: string;
  rating?: string;
  tag?: string;
}) {
  return store.queryList<Record<string, unknown>>(
    ["feedback"],
    {
      ...(params.agentId && { agentId: (f) => f.agentId === params.agentId }),
      ...(params.status && params.status !== "ALL" && {
        status: (f) => f.status === params.status,
      }),
      ...(params.severity && params.severity !== "ALL" && {
        severity: (f) => f.severity === params.severity,
      }),
      ...(params.rating && params.rating !== "ALL" && {
        rating: (f) => f.rating === params.rating,
      }),
      ...(params.tag && {
        tag: (f) => Array.isArray(f.tags) && (f.tags as string[]).includes(params.tag!),
      }),
    },
    (a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)),
    params.skip,
    params.take,
  );
}

export async function getFeedback(id: string) {
  const fb = store.read<Record<string, unknown>>("feedback", `${id}.json`);
  if (!fb) return null;
  return withAgentName(fb);
}

export async function createFeedback(input: {
  agentId: string;
  title: string;
  content: string;
  rating: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  tags?: string[];
  severity?: "CRITICAL" | "MAJOR" | "MINOR" | "SUGGESTION";
  sessionData?: unknown;
  targetPartition?: "PROMPT" | "KNOWLEDGE" | "TOOLS" | "ROUTING" | null;
}) {
  const agent = store.read("agents", `${input.agentId}.json`);
  if (!agent) throw new Error("Agent 不存在");

  const id = store.generateId();
  const ts = store.now();
  const feedback = {
    id,
    agentId: input.agentId,
    source: "MANUAL",
    title: input.title,
    content: input.content,
    rating: input.rating,
    tags: input.tags ?? [],
    severity: input.severity ?? "MINOR",
    status: "NEW",
    targetPartition: input.targetPartition ?? null,
    sessionData: input.sessionData ?? null,
    submittedBy: "system",
    submittedAt: ts,
  };

  store.write(feedback, "feedback", `${id}.json`);
  return withAgentName(feedback as Record<string, unknown>);
}

export async function updateFeedback(id: string, input: {
  status?: "NEW" | "TRIAGED" | "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "VERIFIED" | "CLOSED" | "WONTFIX";
  severity?: "CRITICAL" | "MAJOR" | "MINOR" | "SUGGESTION";
  assignedTo?: string | null;
  resolution?: string | null;
  targetPartition?: "PROMPT" | "KNOWLEDGE" | "TOOLS" | "ROUTING" | null;
  verificationNote?: string | null;
}) {
  const fb = store.read<Record<string, unknown>>("feedback", `${id}.json`);
  if (!fb) throw new Error("Feedback 不存在");

  const ts = store.now();
  const updated: Record<string, unknown> = { ...fb };

  if (input.status !== undefined) {
    updated.status = input.status;
    if (input.status === "RESOLVED") updated.resolvedAt = ts;
    if (input.status === "ASSIGNED" && input.assignedTo) {
      updated.assignedTo = input.assignedTo;
      updated.assignedAt = ts;
    }
    if (input.status === "VERIFIED") {
      updated.verifiedAt = ts;
      if (input.verificationNote) updated.verificationNote = input.verificationNote;
    }
  }
  if (input.severity !== undefined) updated.severity = input.severity;
  if (input.resolution !== undefined) updated.resolution = input.resolution;
  if (input.targetPartition !== undefined) updated.targetPartition = input.targetPartition;

  store.write(updated, "feedback", `${id}.json`);
  return withAgentName(updated);
}
