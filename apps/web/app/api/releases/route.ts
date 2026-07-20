import { NextRequest } from "next/server";
import { store } from "@/lib/data/store";
import { success, parsePagination, paginationMeta } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip, take } = parsePagination(searchParams);
  const status = searchParams.get("status") || undefined;
  const agentId = searchParams.get("agentId") || undefined;

  const agents = store.list<Record<string, unknown>>("agents");

  let items = store.list<Record<string, unknown>>("releases");
  if (status && status !== "ALL") items = items.filter((r) => r.status === status);
  if (agentId) items = items.filter((r) => r.agentId === agentId);

  items.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  const total = items.length;
  items = items.slice(skip, skip + take).map((r) => {
    const agent = agents.find((a) => a.id === r.agentId);
    return {
      ...r,
      agent: agent ? { id: agent.id, name: agent.name } : null,
    };
  });

  return success({
    items,
    pagination: paginationMeta(page, pageSize, total),
  });
}
