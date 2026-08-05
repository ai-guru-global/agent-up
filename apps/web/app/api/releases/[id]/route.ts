import { NextRequest } from "next/server";
import { success, error, handleApiError } from "@/lib/utils";
import { store } from "@/lib/data/store";
import { NotFoundError } from "@/lib/errors";

/**
 * GET /api/releases/[id] — 单个 Release 详情（含 configSnapshot）
 *
 * 返回 release 全字段，包括 configSnapshot（提交时的四分区快照）
 * 和上一个已发布 Version 的快照（作为 diff 的 baseline）。
 * 供前端 diff viewer 展示「这次发布具体改了什么」。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const release = store.read<Record<string, unknown>>("releases", `${id}.json`);
    if (!release) throw new NotFoundError("Release 不存在");

    // join agent name
    const agent = store.read<{ id: string; name: string }>(
      "agents",
      `${release.agentId}.json`,
    );

    // 取上一个已发布 Version 作为 diff baseline（当前 release 之前的最新版本）
    const agentId = release.agentId as string;
    const versions = store
      .list<Record<string, unknown>>("versions")
      .filter((v) => v.agentId === agentId)
      .sort((a, b) =>
        String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")),
      );

    // baseline = 该 release 对应 version 之前的那个版本；如果没有就用全 null
    const releaseVersionId = release.version
      ? (release.version as Record<string, unknown>).id
      : null;
    const baselineIdx = versions.findIndex(
      (v) => v.id === releaseVersionId,
    );
    // 如果 release 已批准（有 version），baseline 是它的前一个；否则是最新那个
    const baseline =
      baselineIdx >= 0 && baselineIdx + 1 < versions.length
        ? versions[baselineIdx + 1]
        : versions[0] ?? null;

    const baselineSnapshots = baseline
      ? {
          prompt: baseline.promptSnapshot ?? null,
          knowledge: baseline.knowledgeSnapshot ?? null,
          tools: baseline.toolsSnapshot ?? null,
          routing: baseline.routingSnapshot ?? null,
          version: baseline.version ?? null,
        }
      : { prompt: null, knowledge: null, tools: null, routing: null, version: null };

    return success({
      ...release,
      agent: agent ? { id: agent.id, name: agent.name } : null,
      baseline: baselineSnapshots,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
