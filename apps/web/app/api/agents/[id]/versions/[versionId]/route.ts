import { NextRequest } from "next/server";
import { success, handleApiError } from "@/lib/utils";
import { store } from "@/lib/data/store";
import { getOrComputeEffectivenessReport } from "@/lib/services/effectiveness-service";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * GET /api/agents/[id]/versions/[versionId] — 单个 Version 详情
 *
 * 返回指定 Version 的全部字段，包括四分区 snapshot、changeNote 等。
 * effectivenessReport 同样走 lazy fill 逻辑（≥7 天自动算）。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const { id, versionId } = await params;
  try {
    const version = store.read<Record<string, unknown>>(
      "versions",
      `${versionId}.json`,
    );
    if (!version) throw new NotFoundError("Version 不存在");
    if (version.agentId !== id) {
      throw new ValidationError("该 Version 不属于此 Agent");
    }

    const report = getOrComputeEffectivenessReport(version as never);
    const item = report ? { ...version, effectivenessReport: report } : version;

    return success(item);
  } catch (err) {
    return handleApiError(err);
  }
}
