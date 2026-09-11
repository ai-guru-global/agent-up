import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, handleApiError } from "@/lib/utils";
import { NotFoundError } from "@/lib/errors";
import { chatCompletion } from "@/lib/services/llm-service";

/**
 * POST /api/releases/[id]/summary — LLM 变更摘要（无状态，不落库）。
 *
 * 读取 Release 的 configSnapshot 与上一版本 baseline，
 * 让 MiMo 总结本次变更的影响面与风险点，辅助审批决策。
 * baseline 计算逻辑与 GET /api/releases/[id] 保持一致。
 */
export async function POST(
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

    // baseline = release 对应 version 的前一个版本；无则最新已发布版本
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

    const snapshot = (release.configSnapshot ?? {}) as Record<string, unknown>;
    const truncate = (v: unknown) => {
      const s = JSON.stringify(v ?? null);
      return s.length > 2000 ? s.slice(0, 2000) + "…(截断)" : s;
    };
    const partitions = ["prompt", "knowledge", "tools", "routing"] as const;
    const changeDetail = partitions
      .map((p) => {
        const before = truncate(baseline ? baseline[`${p}Snapshot`] : null);
        const after = truncate(snapshot[p]);
        return before === after
          ? null
          : `### ${p} 分区\n变更前：${before}\n变更后：${after}`;
      })
      .filter(Boolean)
      .join("\n\n");

    const result = await chatCompletion({
      messages: [
        {
          role: "system",
          content:
            "你是 Agent 改进平台的发布审批顾问。给定一次 Agent 配置变更（四分区：Prompt/Knowledge/Tools/Routing），" +
            "请输出两部分：\n## 变更摘要\n用 2-3 句话概括本次改了什么、意图是什么。\n" +
            "## 风险提示\n列出 1-3 条审批时需要关注的风险或验证建议；若无风险请明确说明。\n" +
            "要求：中文、简洁、面向审批决策者。",
        },
        {
          role: "user",
          content:
            `Agent：${release.agent.name}\n` +
            `变更说明：${release.changeNote ?? "（无）"}\n\n${changeDetail || "（无可对比的变更）"}`,
        },
      ],
    });

    return success({
      releaseId: id,
      summary: result.content,
      model: result.model,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
