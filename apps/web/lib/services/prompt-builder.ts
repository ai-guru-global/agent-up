/**
 * 由四分区 Prompt 配置组装 system prompt。
 *
 * 试聊 Playground（agent 当前草稿配置）与发布 AI 评测（release 快照配置）
 * 共用同一组装函数——评测 replay 的可信度前提是与真实试聊行为完全一致，
 * 两处各写一份组装逻辑必然漂移。
 */

export interface PromptPartitionConfig {
  systemPrompt?: string;
  roleDefinition?: string | null;
  constraints?: string[] | null;
  outputFormat?: string | null;
}

export function buildSystemPrompt(pc: PromptPartitionConfig | null | undefined): string {
  if (!pc) return "";
  const parts = [
    pc.systemPrompt ?? "",
    pc.roleDefinition ? `\n## 角色定义\n${pc.roleDefinition}` : "",
    pc.constraints?.length
      ? `\n## 约束条件\n${pc.constraints.map((c) => `- ${c}`).join("\n")}`
      : "",
    pc.outputFormat ? `\n## 输出格式\n${pc.outputFormat}` : "",
  ];
  return parts.join("");
}
