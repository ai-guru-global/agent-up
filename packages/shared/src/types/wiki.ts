// Wiki 相关类型
export interface WikiVault {
  id: string;
  name: string;
  description?: string;
  agentId?: string;
  gitRepoUrl?: string;
  gitBranch: string;
  pageCount: number;
  avgConfidence: number;
  isShared: boolean;
}

export interface WikiPage {
  id: string;
  vaultId: string;
  title: string;
  slug: string;
  content: string;
  summary?: string;
  provenance: Provenance;
  lifecycle: PageLifecycle;
  tier: PageTier;
  baseConfidence: number;
  sourceRefs: SourceRef[];
  wikilinks: string[];
  categories: string[];
  tags: string[];
}

export interface SourceRef {
  type: "document" | "feedback" | "url" | "session";
  id?: string;
  description: string;
}

export enum Provenance {
  EXTRACTED = "EXTRACTED",
  INFERRED = "INFERRED",
  AMBIGUOUS = "AMBIGUOUS",
  SYNTHESIZED = "SYNTHESIZED",
}

export enum PageLifecycle {
  DRAFT = "DRAFT",
  REVIEWED = "REVIEWED",
  VERIFIED = "VERIFIED",
  DISPUTED = "DISPUTED",
  ARCHIVED = "ARCHIVED",
}

export enum PageTier {
  CORE = "CORE",
  SUPPORTING = "SUPPORTING",
  PERIPHERAL = "PERIPHERAL",
}

export enum WikiJobType {
  INGEST = "INGEST",
  UPDATE = "UPDATE",
  SYNTHESIZE = "SYNTHESIZE",
  LINT = "LINT",
  DEDUP = "DEDUP",
}

export enum JobStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}
