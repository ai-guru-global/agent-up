import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, handleApiError } from "@/lib/utils";
import { toReleaseResponse } from "@/lib/services/agent-service";
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
    const release = await prisma.release.findUnique({
      where: { id },
      include: {
        agent: { select: { id: true, name: true } },
        version: true,
      },
    });
    if (!release) throw new NotFoundError("Release 不存在");

    // baseline = 该 release 对应 version 之前的那个版本；如果没有就用最新那个
    const versions = await prisma.agentVersion.findMany({
      where: { agentId: release.agentId },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    });
    const releaseVersionId = release.version?.id ?? null;
    const baselineIdx = versions.findIndex((v) => v.id === releaseVersionId);
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
      ...toReleaseResponse(release),
      agent: { id: release.agent.id, name: release.agent.name },
      baseline: baselineSnapshots,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
