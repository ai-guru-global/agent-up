import { NextRequest } from "next/server";
import { success, handleApiError } from "@/lib/utils";
import { store } from "@/lib/data/store";
import { getOrComputeEffectivenessReport } from "@/lib/services/effectiveness-service";

/**
 * GET /api/agents/[id]/versions — 某 Agent 的版本历史（含不可变快照）
 *
 * 返回所有已发布 Version，按 publishedAt 倒序。每个 version 含四个分区的
 * snapshot，供前端展示版本历史 + 一键回滚。
 *
 * 副作用：若某 version 距今 ≥ 7 天 且 effectivenessReport 缺失，则 lazy 计算
 * 并写回（见 effectiveness-service 的 getOrComputeEffectivenessReport）。
 * 已存在则直接返回，不重复算。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const versions = store
      .list<Record<string, unknown>>("versions")
      .filter((v) => v.agentId === id)
      .sort((a, b) =>
        String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")),
      );

    if (versions.length === 0) {
      return success({ items: [], total: 0 });
    }

    // lazy fill：若 effectivenessReport 缺失 + 已过窗口，则算 + 写回
    const items = versions.map((v) => {
      const report = getOrComputeEffectivenessReport(v as never);
      return report ? { ...v, effectivenessReport: report } : v;
    });

    return success({ items, total: items.length });
  } catch (err) {
    return handleApiError(err);
  }
}
