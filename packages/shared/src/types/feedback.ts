// Feedback 相关类型
export interface Feedback {
  id: string;
  agentId: string;
  source: FeedbackSource;
  title: string;
  content: string;
  rating: FeedbackRating;
  tags: FeedbackTag[];
  severity: FeedbackSeverity;
  status: FeedbackStatus;
  targetPartition?: ConfigPartition;
  submittedBy: string;
  submittedAt: Date;
}

export enum FeedbackSource {
  MANUAL = "MANUAL",
  API = "API",
  SESSION_IMPORT = "SESSION_IMPORT",
  SYSTEM = "SYSTEM",
}

export enum FeedbackRating {
  POSITIVE = "POSITIVE",
  NEGATIVE = "NEGATIVE",
  NEUTRAL = "NEUTRAL",
}

export enum FeedbackTag {
  ANSWER_QUALITY = "ANSWER_QUALITY",
  KNOWLEDGE_GAP = "KNOWLEDGE_GAP",
  TOOL_FAILURE = "TOOL_FAILURE",
  ROUTING_ERROR = "ROUTING_ERROR",
  HALLUCINATION = "HALLUCINATION",
  OUTDATED_INFO = "OUTDATED_INFO",
  TONE_ISSUE = "TONE_ISSUE",
  INCOMPLETE = "INCOMPLETE",
  OFF_TOPIC = "OFF_TOPIC",
}

export enum FeedbackSeverity {
  CRITICAL = "CRITICAL",
  MAJOR = "MAJOR",
  MINOR = "MINOR",
  SUGGESTION = "SUGGESTION",
}

export enum FeedbackStatus {
  NEW = "NEW",
  TRIAGED = "TRIAGED",
  ASSIGNED = "ASSIGNED",
  IN_PROGRESS = "IN_PROGRESS",
  RESOLVED = "RESOLVED",
  VERIFIED = "VERIFIED",
  CLOSED = "CLOSED",
  WONTFIX = "WONTFIX",
}

// Import ConfigPartition from agent types
import type { ConfigPartition } from "./agent";
