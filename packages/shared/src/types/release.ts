// Release & Version 相关类型
export interface Release {
  id: string;
  agentId: string;
  changeNote: string;
  changedPartitions: ConfigPartition[];
  status: ReleaseStatus;
  submittedBy: string;
  submittedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  reviewComment?: string;
}

export enum ReleaseStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  CHANGES_REQUESTED = "CHANGES_REQUESTED",
}

export interface AgentVersion {
  id: string;
  agentId: string;
  version: string;
  major: number;
  minor: number;
  patch: number;
  changeNote: string;
  publishedAt: Date;
  publishedBy: string;
}

// Import ConfigPartition
import type { ConfigPartition } from "./agent";
