/**
 * 原 Prisma enum 的 TS 重建（2026-10-05 SQLite 迁移）。
 *
 * Prisma 的 SQLite 连接器不支持数据库级 enum，schema 中的 enum 定义已删除、
 * 列一律改 String。这里以 const 对象 + 同名 union type 重建全部 18 个枚举：
 * - type 侧：`import { type FeedbackStatus } from "@agent-up/db"` 的既有写法
 *   继续成立（index.ts 同时 re-export @prisma/client 与本模块，同名不冲突——
 *   Prisma 不再生成这些符号）；
 * - 值侧：与迁移前的数据库枚举值逐字一致，存量字符串数据无需转换。
 * 运行时入参校验的权威在 apps/web/lib/schemas.ts 的 Zod（值域与此对齐）。
 */

export const GroupRole = {
  LEAD: "LEAD",
  MEMBER: "MEMBER",
} as const;
export type GroupRole = (typeof GroupRole)[keyof typeof GroupRole];

export const AgentStatus = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type AgentStatus = (typeof AgentStatus)[keyof typeof AgentStatus];

export const SearchStrategy = {
  WIKI_FIRST: "WIKI_FIRST",
  WIKI_ONLY: "WIKI_ONLY",
  MCP_FIRST: "MCP_FIRST",
  HYBRID: "HYBRID",
} as const;
export type SearchStrategy =
  (typeof SearchStrategy)[keyof typeof SearchStrategy];

export const SyncStatus = {
  SYNCED: "SYNCED",
  SYNCING: "SYNCING",
  OUT_OF_SYNC: "OUT_OF_SYNC",
  ERROR: "ERROR",
} as const;
export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

export const ConfigPartition = {
  PROMPT: "PROMPT",
  KNOWLEDGE: "KNOWLEDGE",
  TOOLS: "TOOLS",
  ROUTING: "ROUTING",
} as const;
export type ConfigPartition =
  (typeof ConfigPartition)[keyof typeof ConfigPartition];

export const FeedbackRating = {
  POSITIVE: "POSITIVE",
  NEGATIVE: "NEGATIVE",
  NEUTRAL: "NEUTRAL",
} as const;
export type FeedbackRating =
  (typeof FeedbackRating)[keyof typeof FeedbackRating];

export const FeedbackTag = {
  ANSWER_QUALITY: "ANSWER_QUALITY",
  KNOWLEDGE_GAP: "KNOWLEDGE_GAP",
  TOOL_FAILURE: "TOOL_FAILURE",
  ROUTING_ERROR: "ROUTING_ERROR",
  HALLUCINATION: "HALLUCINATION",
  OUTDATED_INFO: "OUTDATED_INFO",
  TONE_ISSUE: "TONE_ISSUE",
  INCOMPLETE: "INCOMPLETE",
  OFF_TOPIC: "OFF_TOPIC",
} as const;
export type FeedbackTag = (typeof FeedbackTag)[keyof typeof FeedbackTag];

export const FeedbackSeverity = {
  CRITICAL: "CRITICAL",
  MAJOR: "MAJOR",
  MINOR: "MINOR",
  SUGGESTION: "SUGGESTION",
} as const;
export type FeedbackSeverity =
  (typeof FeedbackSeverity)[keyof typeof FeedbackSeverity];

export const FeedbackStatus = {
  NEW: "NEW",
  TRIAGED: "TRIAGED",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
  VERIFIED: "VERIFIED",
  CLOSED: "CLOSED",
  WONTFIX: "WONTFIX",
} as const;
export type FeedbackStatus =
  (typeof FeedbackStatus)[keyof typeof FeedbackStatus];

export const ReleaseStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
} as const;
export type ReleaseStatus =
  (typeof ReleaseStatus)[keyof typeof ReleaseStatus];

export const SkillCategory = {
  KNOWLEDGE_QUERY: "KNOWLEDGE_QUERY",
  DATA_FETCH: "DATA_FETCH",
  ACTION: "ACTION",
  TRANSFORM: "TRANSFORM",
  GENERAL: "GENERAL",
} as const;
export type SkillCategory =
  (typeof SkillCategory)[keyof typeof SkillCategory];

export const SkillRuntime = {
  HTTP: "HTTP",
  FUNCTION: "FUNCTION",
  MCP: "MCP",
  WORKFLOW: "WORKFLOW",
} as const;
export type SkillRuntime = (typeof SkillRuntime)[keyof typeof SkillRuntime];

export const SkillStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  DEPRECATED: "DEPRECATED",
  ARCHIVED: "ARCHIVED",
} as const;
export type SkillStatus = (typeof SkillStatus)[keyof typeof SkillStatus];

export const Provenance = {
  EXTRACTED: "EXTRACTED",
  INFERRED: "INFERRED",
  AMBIGUOUS: "AMBIGUOUS",
  SYNTHESIZED: "SYNTHESIZED",
  AUTHORED: "AUTHORED",
  DISTILLED: "DISTILLED",
  IMPORTED: "IMPORTED",
} as const;
export type Provenance = (typeof Provenance)[keyof typeof Provenance];

export const PageLifecycle = {
  DRAFT: "DRAFT",
  REVIEWED: "REVIEWED",
  VERIFIED: "VERIFIED",
  DISPUTED: "DISPUTED",
  ARCHIVED: "ARCHIVED",
  IN_REVIEW: "IN_REVIEW",
  STALE: "STALE",
  DEPRECATED: "DEPRECATED",
} as const;
export type PageLifecycle =
  (typeof PageLifecycle)[keyof typeof PageLifecycle];

export const PageTier = {
  CORE: "CORE",
  SUPPORTING: "SUPPORTING",
  PERIPHERAL: "PERIPHERAL",
  SPECIALIZED: "SPECIALIZED",
  EDGE_CASE: "EDGE_CASE",
} as const;
export type PageTier = (typeof PageTier)[keyof typeof PageTier];

export const WikiJobType = {
  INGEST: "INGEST",
  UPDATE: "UPDATE",
  SYNTHESIZE: "SYNTHESIZE",
  LINT: "LINT",
  DEDUP: "DEDUP",
} as const;
export type WikiJobType = (typeof WikiJobType)[keyof typeof WikiJobType];

export const JobStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];
