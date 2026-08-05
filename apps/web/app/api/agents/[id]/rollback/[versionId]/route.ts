import { NextRequest } from "next/server";
import { success, handleApiError } from "@/lib/utils";
import { createRollbackRelease } from "@/lib/services/release-service";
import { withActor, resolveActor } from "@/lib/context";

/**
 * POST /api/agents/[id]/rollback/[versionId] — 整版本回滚（一键回到指定 Version）
 *
 * 与单分区 POST /config/[partition]/rollback 的区别：
 * - 单分区：只回滚当前 tab 的一个分区
 * - 整版本：一次回滚全部 4 个分区，保证组合与历史快照完全一致
 *
 * 行为：
 * 1) 覆盖 Agent 4 个 active config 为 target Version 的 snapshot
 * 2) 写入一个 status=APPROVED 的 release（含 configSnapshot）做追溯
 * 3) 派生新 Version（版本号自增），确保历史快照不可变
 * 4) 写入 audit，action = "agent.rollback"
 *
 * path: id = agentId, versionId = 目标 Version 的 id
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const { id, versionId } = await params;

  try {
    const result = await withActor(
      resolveActor(_request.headers),
      () => createRollbackRelease(id, versionId),
    );
    return success(result);
  } catch (err) {
    return handleApiError(err);
  }
}
