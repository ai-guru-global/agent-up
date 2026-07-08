// Skill 相关类型
export interface Skill {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: SkillCategory;
  triggerPatterns: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  runtime: SkillRuntime;
  version: string;
  status: SkillStatus;
  authorId: string;
  authorName: string;
}

export enum SkillCategory {
  KNOWLEDGE_QUERY = "KNOWLEDGE_QUERY",
  DATA_FETCH = "DATA_FETCH",
  ACTION = "ACTION",
  TRANSFORM = "TRANSFORM",
  GENERAL = "GENERAL",
}

export enum SkillRuntime {
  HTTP = "HTTP",
  FUNCTION = "FUNCTION",
  MCP = "MCP",
  WORKFLOW = "WORKFLOW",
}

export enum SkillStatus {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  DEPRECATED = "DEPRECATED",
  ARCHIVED = "ARCHIVED",
}

export interface AgentSkillBinding {
  id: string;
  agentId: string;
  skillId: string;
  config?: Record<string, unknown>;
  enabled: boolean;
  priority: number;
  allowedScopes: string[];
}
