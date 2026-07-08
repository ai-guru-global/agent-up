/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/utils";
import {
  updatePromptConfigSchema,
  updateKnowledgeConfigSchema,
  updateToolsConfigSchema,
  updateRoutingConfigSchema,
} from "@/lib/schemas";
import {
  getAgentConfig,
  updatePromptConfig,
  updateKnowledgeConfig,
  updateToolsConfig,
  updateRoutingConfig,
  recordConfigChange,
} from "@/lib/services/agent-service";

const VALID_PARTITIONS = ["prompt", "knowledge", "tools", "routing"] as const;
type Partition = (typeof VALID_PARTITIONS)[number];

const PARTITION_SCHEMA = {
  prompt: updatePromptConfigSchema,
  knowledge: updateKnowledgeConfigSchema,
  tools: updateToolsConfigSchema,
  routing: updateRoutingConfigSchema,
} as const;

const PARTITION_ENUM = {
  prompt: "PROMPT",
  knowledge: "KNOWLEDGE",
  tools: "TOOLS",
  routing: "ROUTING",
} as const;

/** GET /api/agents/[id]/config/[partition] — 获取分区配置 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; partition: string }> }
) {
  const { id, partition } = await params;

  if (!VALID_PARTITIONS.includes(partition as Partition)) {
    return error(`无效的分区: ${partition}，可选: ${VALID_PARTITIONS.join(", ")}`, 400);
  }

  try {
    const config = await getAgentConfig(id, partition as Partition);
    return success(config);
  } catch (err) {
    return error(err instanceof Error ? err.message : "获取失败", 404);
  }
}

/** PUT /api/agents/[id]/config/[partition] — 更新分区配置 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; partition: string }> }
) {
  const { id, partition } = await params;

  if (!VALID_PARTITIONS.includes(partition as Partition)) {
    return error(`无效的分区: ${partition}`, 400);
  }

  const body = await parseBody(request);
  if (!body) return error("无效的请求体");

  const part = partition as Partition;
  const schema = PARTITION_SCHEMA[part];
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return error("参数校验失败", 400, parsed.error.errors.map((e) => e.message));
  }

  try {
    // 获取旧配置用于变更记录
    const before = await getAgentConfig(id, part);

    // 更新配置
    let result: any;
    switch (part) {
      case "prompt":
        result = await updatePromptConfig(id, parsed.data as any);
        break;
      case "knowledge":
        result = await updateKnowledgeConfig(id, parsed.data as any);
        break;
      case "tools":
        result = await updateToolsConfig(id, parsed.data as any);
        break;
      case "routing":
        result = await updateRoutingConfig(id, parsed.data as any);
        break;
    }

    // 记录变更
    await recordConfigChange(id, PARTITION_ENUM[part] as any, before, result);

    return success(result);
  } catch (err) {
    return error(err instanceof Error ? err.message : "更新失败", 500);
  }
}
