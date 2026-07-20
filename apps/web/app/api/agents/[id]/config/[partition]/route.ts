import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/utils";
import {
  updatePromptConfigSchema,
  updateKnowledgeConfigSchema,
  updateToolsConfigSchema,
  updateRoutingConfigSchema,
} from "@/lib/schemas";
import type { ZodSchema } from "zod";
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

const PARTITION_SCHEMA: Record<Partition, ZodSchema> = {
  prompt: updatePromptConfigSchema,
  knowledge: updateKnowledgeConfigSchema,
  tools: updateToolsConfigSchema,
  routing: updateRoutingConfigSchema,
};

const PARTITION_ENUM: Record<Partition, "PROMPT" | "KNOWLEDGE" | "TOOLS" | "ROUTING"> = {
  prompt: "PROMPT",
  knowledge: "KNOWLEDGE",
  tools: "TOOLS",
  routing: "ROUTING",
};

function isValidPartition(p: string): p is Partition {
  return (VALID_PARTITIONS as readonly string[]).includes(p);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; partition: string }> }
) {
  const { id, partition } = await params;

  if (!isValidPartition(partition)) {
    return error(`无效的分区: ${partition}，可选: ${VALID_PARTITIONS.join(", ")}`, 400);
  }

  try {
    const config = await getAgentConfig(id, partition);
    return success(config);
  } catch (err) {
    return error(err instanceof Error ? err.message : "获取失败", 404);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; partition: string }> }
) {
  const { id, partition } = await params;

  if (!isValidPartition(partition)) {
    return error(`无效的分区: ${partition}`, 400);
  }

  const body = await parseBody(request);
  if (!body) return error("无效的请求体");

  const schema = PARTITION_SCHEMA[partition];
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return error("参数校验失败", 400, parsed.error.errors.map((e) => e.message));
  }

  try {
    const before = await getAgentConfig(id, partition);

    let result: unknown;
    switch (partition) {
      case "prompt":
        result = await updatePromptConfig(id, parsed.data);
        break;
      case "knowledge":
        result = await updateKnowledgeConfig(id, parsed.data);
        break;
      case "tools":
        result = await updateToolsConfig(id, parsed.data);
        break;
      case "routing":
        result = await updateRoutingConfig(id, parsed.data);
        break;
    }

    await recordConfigChange(id, PARTITION_ENUM[partition], before, result);

    return success(result);
  } catch (err) {
    return error(err instanceof Error ? err.message : "更新失败", 500);
  }
}
