import { NextRequest } from "next/server";
import { success, error, validateBody, handleApiError } from "@/lib/utils";
import { z } from "zod";
import { store } from "@/lib/data/store";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  getAgentConfig,
  updatePromptConfig,
  updateKnowledgeConfig,
  updateToolsConfig,
  updateRoutingConfig,
  recordConfigChange,
} from "@/lib/services/agent-service";
import { withActor, resolveActor } from "@/lib/context";

const VALID_PARTITIONS = ["prompt", "knowledge", "tools", "routing"] as const;
type Partition = (typeof VALID_PARTITIONS)[number];

const PARTITION_ENUM: Record<Partition, "PROMPT" | "KNOWLEDGE" | "TOOLS" | "ROUTING"> = {
  prompt: "PROMPT",
  knowledge: "KNOWLEDGE",
  tools: "TOOLS",
  routing: "ROUTING",
};

const rollbackSchema = z.object({
  versionId: z.string().min(1, "versionId 不能为空"),
});

function isValidPartition(p: string): p is Partition {
  return (VALID_PARTITIONS as readonly string[]).includes(p);
}

/**
 * POST /api/agents/[id]/config/[partition]/rollback — 分区级一键回滚
 *
 * 从指定 Version 的 snapshot 中取出该分区的配置，覆盖当前 active 配置。
 * 本质 = 用历史快照 PUT 一次配置（复用现有的 config 更新 + recordConfigChange 流程）。
 *
 * body: { versionId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; partition: string }> },
) {
  const { id, partition } = await params;

  if (!isValidPartition(partition)) {
    return error(`无效的分区: ${partition}`, 400);
  }

  const validated = await validateBody(request, rollbackSchema);
  if (!validated.ok) return validated.response;

  try {
    return await withActor(resolveActor(request.headers), async () => {
      // 找到目标 version
      const version = store.read<Record<string, unknown>>(
        "versions",
        `${validated.data.versionId}.json`,
      );
      if (!version) throw new NotFoundError("Version 不存在");
      if (version.agentId !== id) {
        throw new ValidationError("该 Version 不属于此 Agent");
      }

      // 取该分区的 snapshot
      const snapshotKey = `${partition}Snapshot` as keyof typeof version;
      const snapshot = version[snapshotKey] as Record<string, unknown> | null;
      if (!snapshot) {
        throw new ValidationError(
          `Version ${version.version} 的 ${partition} 分区无快照`,
        );
      }

      // 回滚前先留底（before）
      const before = await getAgentConfig(id, partition);

      // 用快照覆盖（复用分区更新函数）
      // 注意：去掉 snapshot 里可能有的 version/lastModifiedAt 字段，让 updateConfigPartition 重新算
      const { version: _v, lastModifiedAt: _l, ...restorePayload } = snapshot as Record<string, unknown>;
      const partitionKey = partition as Partition;
      let result: unknown;
      switch (partitionKey) {
        case "prompt":
          result = await updatePromptConfig(id, restorePayload);
          break;
        case "knowledge":
          result = await updateKnowledgeConfig(id, restorePayload);
          break;
        case "tools":
          result = await updateToolsConfig(id, restorePayload);
          break;
        case "routing":
          result = await updateRoutingConfig(id, restorePayload);
          break;
      }

      // 记录变更（before = 回滚前, after = 回滚后的快照）
      await recordConfigChange(
        id,
        `${PARTITION_ENUM[partition]}_ROLLBACK`,
        before,
        result,
        `回滚到 Version ${version.version}`,
      );

      return success({
        partition,
        restoredFromVersion: version.version,
        config: result,
      });
    });
  } catch (err) {
    return handleApiError(err);
  }
}
