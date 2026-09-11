import { NextRequest } from "next/server";
import { success, handleApiError } from "@/lib/utils";
import { getVersionLineage } from "@/lib/services/version-lineage-service";

/**
 * GET /api/agents/[id]/version-lineage — Harness 资产演进历史（只读聚合）。
 * 按 publishedAt 升序相邻版本 4 分区 diff，首版本为基线（见 version-lineage-service）。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return success(getVersionLineage(id));
  } catch (err) {
    return handleApiError(err);
  }
}
