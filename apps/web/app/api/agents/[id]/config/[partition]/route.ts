import { NextRequest } from "next/server";
import { success, error, validateBody, handleApiError } from "@/lib/utils";
import { PARTITION_SCHEMA } from "@/lib/schemas";
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
    return handleApiError(err);
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

  const validated = await validateBody(request, PARTITION_SCHEMA[partition]);
  if (!validated.ok) return validated.response;

  try {
    return await withActor(resolveActor(request.headers), async () => {
      const before = await getAgentConfig(id, partition);

      let result: unknown;
      switch (partition) {
        case "prompt":
          result = await updatePromptConfig(id, validated.data);
          break;
        case "knowledge":
          result = await updateKnowledgeConfig(id, validated.data);
          break;
        case "tools":
          result = await updateToolsConfig(id, validated.data);
          break;
        case "routing":
          result = await updateRoutingConfig(id, validated.data);
          break;
      }

      await recordConfigChange(id, PARTITION_ENUM[partition], before, result);
      return success(result);
    });
  } catch (err) {
    return handleApiError(err);
  }
}
