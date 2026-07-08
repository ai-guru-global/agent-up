import { z } from "zod";

// ============================================================
// Agent
// ============================================================

export const createAgentSchema = z.object({
  name: z.string().min(1, "Agent 名称不能为空").max(100),
  description: z.string().max(500).optional(),
  productGroupId: z.string().min(1, "产品组不能为空"),
});

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
});

// ============================================================
// Agent Config Partitions
// ============================================================

export const updatePromptConfigSchema = z.object({
  systemPrompt: z.string().min(1, "系统提示词不能为空"),
  roleDefinition: z.string().nullable().optional(),
  constraints: z.array(z.string()).optional(),
  outputFormat: z.string().nullable().optional(),
});

export const updateKnowledgeConfigSchema = z.object({
  wikiVaultId: z.string().nullable().optional(),
  searchStrategy: z.enum(["WIKI_FIRST", "WIKI_ONLY", "MCP_FIRST", "HYBRID"]).optional(),
  fallbackToMcp: z.boolean().optional(),
  maxWikiResults: z.number().int().min(1).max(50).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
});

export const updateToolsConfigSchema = z.object({
  mcpTools: z.array(z.any()).optional(),
  wikiQueryTools: z.array(z.any()).optional(),
  maxConcurrentCalls: z.number().int().min(1).max(20).optional(),
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
  retryCount: z.number().int().min(0).max(5).optional(),
});

export const updateRoutingConfigSchema = z.object({
  rules: z.array(z.any()).optional(),
  escalationPolicy: z.any().nullable().optional(),
  humanThreshold: z.number().min(0).max(1).optional(),
  maxConversationTurns: z.number().int().min(1).max(100).optional(),
  idleTimeoutMinutes: z.number().int().min(1).max(60).optional(),
});

// ============================================================
// Feedback
// ============================================================

export const createFeedbackSchema = z.object({
  agentId: z.string().min(1),
  title: z.string().min(1, "标题不能为空").max(200),
  content: z.string().min(1, "内容不能为空"),
  rating: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]),
  tags: z.array(
    z.enum([
      "ANSWER_QUALITY", "KNOWLEDGE_GAP", "TOOL_FAILURE",
      "ROUTING_ERROR", "HALLUCINATION", "OUTDATED_INFO",
      "TONE_ISSUE", "INCOMPLETE", "OFF_TOPIC",
    ])
  ).optional(),
  severity: z.enum(["CRITICAL", "MAJOR", "MINOR", "SUGGESTION"]).optional(),
  sessionData: z.any().optional(),
  targetPartition: z.enum(["PROMPT", "KNOWLEDGE", "TOOLS", "ROUTING"]).nullable().optional(),
});

export const updateFeedbackSchema = z.object({
  status: z.enum([
    "NEW", "TRIAGED", "ASSIGNED", "IN_PROGRESS",
    "RESOLVED", "VERIFIED", "CLOSED", "WONTFIX",
  ]).optional(),
  severity: z.enum(["CRITICAL", "MAJOR", "MINOR", "SUGGESTION"]).optional(),
  assignedTo: z.string().nullable().optional(),
  resolution: z.string().nullable().optional(),
  targetPartition: z.enum(["PROMPT", "KNOWLEDGE", "TOOLS", "ROUTING"]).nullable().optional(),
  verificationNote: z.string().nullable().optional(),
});

// ============================================================
// Release
// ============================================================

export const submitReleaseSchema = z.object({
  changeNote: z.string().min(1, "变更说明不能为空").max(2000),
});

export const reviewReleaseSchema = z.object({
  action: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]),
  reviewComment: z.string().max(2000).optional(),
});

// ============================================================
// Common
// ============================================================

export const idParamSchema = z.string().min(1);

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;
export type SubmitReleaseInput = z.infer<typeof submitReleaseSchema>;
export type ReviewReleaseInput = z.infer<typeof reviewReleaseSchema>;
