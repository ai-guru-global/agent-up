// Agent 相关类型
export interface Agent {
  id: string;
  name: string;
  description?: string;
  productGroupId: string;
  status: AgentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export enum AgentStatus {
  DRAFT = "DRAFT",
  ACTIVE = "ACTIVE",
  ARCHIVED = "ARCHIVED",
}

export enum ConfigPartition {
  PROMPT = "PROMPT",
  KNOWLEDGE = "KNOWLEDGE",
  TOOLS = "TOOLS",
  ROUTING = "ROUTING",
}

// Prompt 配置
export interface PromptConfig {
  systemPrompt: string;
  roleDefinition?: string;
  constraints: string[];
  outputFormat?: string;
}

// Knowledge 配置
export interface KnowledgeConfig {
  wikiVaultId?: string;
  searchStrategy: SearchStrategy;
  fallbackToMcp: boolean;
  maxWikiResults: number;
  confidenceThreshold: number;
}

export enum SearchStrategy {
  WIKI_FIRST = "WIKI_FIRST",
  WIKI_ONLY = "WIKI_ONLY",
  MCP_FIRST = "MCP_FIRST",
  HYBRID = "HYBRID",
}

// MCP Tool 配置
export interface McpToolConfig {
  name: string;
  displayName: string;
  description: string;
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  authType: "none" | "bearer" | "api_key";
  permissionScope: "read_only" | "read_write";
  enabled: boolean;
}

// Wiki Query Tool 配置
export interface WikiQueryToolConfig {
  name: string;
  displayName: string;
  description: string;
  searchType: "keyword" | "semantic" | "hybrid";
  maxResults: number;
  minConfidence: number;
  enabled: boolean;
}

// Tools 配置
export interface ToolsConfig {
  mcpTools: McpToolConfig[];
  wikiQueryTools: WikiQueryToolConfig[];
  maxConcurrentCalls: number;
  timeoutMs: number;
  retryCount: number;
}

// Routing 配置
export interface RoutingRule {
  id: string;
  name: string;
  matchCondition: {
    keywords?: string[];
    category?: string;
  };
  action: {
    type: "route_to_agent" | "route_to_human" | "route_to_subflow";
    targetAgentId?: string;
    priority: number;
  };
}

export interface RoutingConfig {
  rules: RoutingRule[];
  defaultAction: {
    type: "route_to_human" | "route_to_agent";
    reason: string;
  };
  humanThreshold: number;
  maxConversationTurns: number;
  idleTimeoutMinutes: number;
}
