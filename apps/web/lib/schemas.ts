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

// 分区名 → schema 映射，供 config route 复用
export const PARTITION_SCHEMA = {
  prompt: updatePromptConfigSchema,
  knowledge: updateKnowledgeConfigSchema,
  tools: updateToolsConfigSchema,
  routing: updateRoutingConfigSchema,
} as const;

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
  releaseId: z.string().min(1, "releaseId 不能为空"),
  action: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]),
  reviewComment: z.string().max(2000).optional(),
});

// ============================================================
// Skill（从 api/skills/route.ts 内联 schema 迁出并强化）
// ============================================================

export const skillCategoryEnum = z.enum([
  "KNOWLEDGE_QUERY", "DATA_FETCH", "ACTION", "TRANSFORM", "GENERAL",
]);
export const skillRuntimeEnum = z.enum(["HTTP", "FUNCTION", "MCP", "WORKFLOW"]);

export const createSkillSchema = z.object({
  name: z.string().min(1, "Skill name 不能为空").max(100),
  displayName: z.string().min(1, "displayName 不能为空").max(200),
  description: z.string().min(1, "description 不能为空").max(2000),
  category: skillCategoryEnum.optional(),
  triggerPatterns: z.array(z.string()).optional(),
  inputSchema: z.any().optional(),
  outputSchema: z.any().optional(),
  runtime: skillRuntimeEnum.optional(),
  endpoint: z.string().optional(),
});

export const updateSkillSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  category: skillCategoryEnum.optional(),
  triggerPatterns: z.array(z.string()).optional(),
  inputSchema: z.any().optional(),
  outputSchema: z.any().optional(),
  runtime: skillRuntimeEnum.optional(),
  endpoint: z.string().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "DEPRECATED"]).optional(),
});

export const bindSkillSchema = z.object({
  skillId: z.string().min(1, "skillId 不能为空"),
  config: z.any().optional(),
});

// ============================================================
// Wiki Vault & Page（此前完全无校验）
// ============================================================

export const createWikiVaultSchema = z.object({
  name: z.string().min(1, "知识库名称不能为空").max(200),
  description: z.string().max(2000).optional(),
  agentId: z.string().nullable().optional(),
  gitRepoUrl: z.string().url("gitRepoUrl 必须是合法 URL").nullable().optional().or(z.literal("")),
  gitBranch: z.string().max(200).optional(),
  isShared: z.boolean().optional(),
});

export const updateWikiVaultSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  gitRepoUrl: z.string().url().nullable().optional().or(z.literal("")),
  gitBranch: z.string().max(200).nullable().optional(),
  isShared: z.boolean().optional(),
});

export const provenanceEnum = z.enum([
  "AUTHORED", "EXTRACTED", "DISTILLED", "IMPORTED", "SYNTHESIZED",
]);
export const pageLifecycleEnum = z.enum([
  "DRAFT", "IN_REVIEW", "VERIFIED", "STALE", "DEPRECATED",
]);
export const pageTierEnum = z.enum(["CORE", "SPECIALIZED", "EDGE_CASE"]);

export const createWikiPageSchema = z.object({
  vaultId: z.string().min(1, "vaultId 不能为空"),
  title: z.string().min(1, "标题不能为空").max(300),
  slug: z.string().min(1, "slug 不能为空").max(300),
  content: z.string().min(1, "content 不能为空"),
  summary: z.string().max(1000).optional(),
  provenance: provenanceEnum.optional(),
  lifecycle: pageLifecycleEnum.optional(),
  tier: pageTierEnum.optional(),
  baseConfidence: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  wikilinks: z.array(z.string()).optional(),
});

export const updateWikiPageSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  content: z.string().min(1).optional(),
  summary: z.string().max(1000).nullable().optional(),
  provenance: provenanceEnum.optional(),
  lifecycle: pageLifecycleEnum.optional(),
  tier: pageTierEnum.optional(),
  baseConfidence: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  wikilinks: z.array(z.string()).optional(),
});

// ============================================================
// Settings: Role / Permission / ProductGroup（此前完全无校验）
// ============================================================

export const createRoleSchema = z.object({
  name: z.string().min(1, "角色标识不能为空").max(100),
  displayName: z.string().min(1, "displayName 不能为空").max(200),
  description: z.string().max(1000).optional(),
});

export const updateRoleSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
});

export const createPermissionSchema = z.object({
  resource: z.string().min(1, "resource 不能为空").max(100),
  action: z.string().min(1, "action 不能为空").max(100),
  description: z.string().max(500).optional(),
});

export const createProductGroupSchema = z.object({
  name: z.string().min(1, "产品组标识不能为空").max(100),
  displayName: z.string().min(1, "displayName 不能为空").max(200),
  description: z.string().max(1000).optional(),
});

// ============================================================
// Common
// ============================================================

export const idParamSchema = z.string().min(1);

// ============================================================
// LLM 试聊（Agent Playground）
// ============================================================

export const agentChatSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      }),
    )
    .max(20)
    .optional(),
});

// ============================================================
// Inferred types
// ============================================================

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;
export type SubmitReleaseInput = z.infer<typeof submitReleaseSchema>;
export type ReviewReleaseInput = z.infer<typeof reviewReleaseSchema>;
export type CreateSkillInput = z.infer<typeof createSkillSchema>;
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;
export type BindSkillInput = z.infer<typeof bindSkillSchema>;
export type CreateWikiVaultInput = z.infer<typeof createWikiVaultSchema>;
export type UpdateWikiVaultInput = z.infer<typeof updateWikiVaultSchema>;
export type CreateWikiPageInput = z.infer<typeof createWikiPageSchema>;
export type UpdateWikiPageInput = z.infer<typeof updateWikiPageSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type CreatePermissionInput = z.infer<typeof createPermissionSchema>;
export type CreateProductGroupInput = z.infer<typeof createProductGroupSchema>;
export type AgentChatInput = z.infer<typeof agentChatSchema>;
