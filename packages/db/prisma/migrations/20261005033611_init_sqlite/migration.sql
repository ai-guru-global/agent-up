-- CreateTable
CREATE TABLE "ProductGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductGroupMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productGroupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductGroupMember_productGroupId_fkey" FOREIGN KEY ("productGroupId") REFERENCES "ProductGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "avatarUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "productGroupId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "Agent_productGroupId_fkey" FOREIGN KEY ("productGroupId") REFERENCES "ProductGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromptConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "roleDefinition" TEXT,
    "constraints" TEXT NOT NULL DEFAULT '[]',
    "outputFormat" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastModifiedBy" TEXT,
    "lastModifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromptConfig_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "wikiVaultId" TEXT,
    "searchStrategy" TEXT NOT NULL DEFAULT 'WIKI_FIRST',
    "fallbackToMcp" BOOLEAN NOT NULL DEFAULT true,
    "maxWikiResults" INTEGER NOT NULL DEFAULT 5,
    "confidenceThreshold" REAL NOT NULL DEFAULT 0.6,
    "lastSyncAt" DATETIME,
    "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastModifiedBy" TEXT,
    "lastModifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeConfig_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeConfig_wikiVaultId_fkey" FOREIGN KEY ("wikiVaultId") REFERENCES "WikiVault" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ToolsConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "mcpTools" TEXT NOT NULL,
    "wikiQueryTools" TEXT NOT NULL,
    "maxConcurrentCalls" INTEGER NOT NULL DEFAULT 3,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "retryCount" INTEGER NOT NULL DEFAULT 2,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastModifiedBy" TEXT,
    "lastModifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ToolsConfig_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoutingConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "rules" TEXT NOT NULL,
    "escalationPolicy" TEXT,
    "humanThreshold" REAL NOT NULL DEFAULT 0.3,
    "maxConversationTurns" INTEGER NOT NULL DEFAULT 10,
    "idleTimeoutMinutes" INTEGER NOT NULL DEFAULT 5,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastModifiedBy" TEXT,
    "lastModifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoutingConfig_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentDraftConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "promptConfig" TEXT,
    "knowledgeConfig" TEXT,
    "toolsConfig" TEXT,
    "routingConfig" TEXT,
    "isDirty" BOOLEAN NOT NULL DEFAULT false,
    "lastSavedBy" TEXT,
    "lastSavedAt" DATETIME,
    CONSTRAINT "AgentDraftConfig_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConfigChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "partition" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT NOT NULL,
    "diff" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeNote" TEXT,
    "releaseId" TEXT,
    CONSTRAINT "ConfigChange_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sessionData" TEXT,
    "rating" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "severity" TEXT NOT NULL DEFAULT 'MINOR',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "assignedTo" TEXT,
    "assignedAt" DATETIME,
    "resolvedAt" DATETIME,
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "releaseId" TEXT,
    "ingestJobId" TEXT,
    "targetPartition" TEXT,
    "externalRefId" TEXT,
    "externalRefUrl" TEXT,
    "submittedBy" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" DATETIME,
    "verifiedBy" TEXT,
    "verificationNote" TEXT,
    CONSTRAINT "Feedback_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "changeNote" TEXT NOT NULL,
    "changedPartitions" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "submittedBy" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "reviewComment" TEXT,
    "configSnapshot" TEXT,
    "aiReview" TEXT,
    "isRollback" BOOLEAN NOT NULL DEFAULT false,
    "rollbackFromVersion" TEXT,
    "rollbackToVersionId" TEXT,
    CONSTRAINT "Release_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "major" INTEGER NOT NULL,
    "minor" INTEGER NOT NULL,
    "patch" INTEGER NOT NULL,
    "promptSnapshot" TEXT NOT NULL,
    "knowledgeSnapshot" TEXT NOT NULL,
    "toolsSnapshot" TEXT NOT NULL,
    "routingSnapshot" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "wikiCommitSha" TEXT,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT NOT NULL,
    "changeNote" TEXT NOT NULL,
    "effectivenessReport" TEXT,
    CONSTRAINT "AgentVersion_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentVersion_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "triggerPatterns" TEXT NOT NULL DEFAULT '[]',
    "inputSchema" TEXT NOT NULL,
    "outputSchema" TEXT NOT NULL,
    "runtime" TEXT NOT NULL DEFAULT 'HTTP',
    "endpoint" TEXT,
    "codeRef" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "dependencies" TEXT NOT NULL DEFAULT '[]',
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" DATETIME,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SkillVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "changelog" TEXT,
    "snapshot" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillVersion_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentSkillBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "config" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "allowedScopes" TEXT NOT NULL DEFAULT '[]',
    "boundAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "boundBy" TEXT NOT NULL,
    CONSTRAINT "AgentSkillBinding_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentSkillBinding_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WikiVault" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "agentId" TEXT,
    "gitRepoUrl" TEXT,
    "gitBranch" TEXT NOT NULL DEFAULT 'main',
    "lastCommitSha" TEXT,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "avgConfidence" REAL NOT NULL DEFAULT 0.0,
    "orphanCount" INTEGER NOT NULL DEFAULT 0,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "sharedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WikiVault_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WikiPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vaultId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'EXTRACTED',
    "lifecycle" TEXT NOT NULL DEFAULT 'DRAFT',
    "tier" TEXT NOT NULL DEFAULT 'SPECIALIZED',
    "baseConfidence" REAL NOT NULL DEFAULT 0.5,
    "sourceRefs" TEXT NOT NULL DEFAULT '[]',
    "wikilinks" TEXT NOT NULL DEFAULT '[]',
    "categories" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "filePath" TEXT NOT NULL,
    "lastCommitSha" TEXT,
    "inboundLinks" INTEGER NOT NULL DEFAULT 0,
    "outboundLinks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    CONSTRAINT "WikiPage_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "WikiVault" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WikiIngestJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vaultId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceContent" TEXT,
    "sourceUrl" TEXT,
    "generatedPageIds" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "error" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "triggeredBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WikiIngestJob_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "WikiVault" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    PRIMARY KEY ("roleId", "permissionId"),
    CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "productGroupId" TEXT,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT NOT NULL,
    CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "details" TEXT,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Trace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "history" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "reply" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "usage" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating" TEXT,
    "ratedAt" DATETIME,
    "note" TEXT,
    CONSTRAINT "Trace_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvalCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "sourceTraceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "expectation" TEXT NOT NULL,
    "assertions" TEXT,
    "systemPrompt" TEXT NOT NULL,
    "history" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "referenceReply" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "EvalCase_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductGroup_name_key" ON "ProductGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductGroupMember_productGroupId_userId_key" ON "ProductGroupMember"("productGroupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Agent_productGroupId_idx" ON "Agent"("productGroupId");

-- CreateIndex
CREATE INDEX "Agent_status_idx" ON "Agent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PromptConfig_agentId_key" ON "PromptConfig"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeConfig_agentId_key" ON "KnowledgeConfig"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeConfig_wikiVaultId_key" ON "KnowledgeConfig"("wikiVaultId");

-- CreateIndex
CREATE UNIQUE INDEX "ToolsConfig_agentId_key" ON "ToolsConfig"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingConfig_agentId_key" ON "RoutingConfig"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentDraftConfig_agentId_key" ON "AgentDraftConfig"("agentId");

-- CreateIndex
CREATE INDEX "ConfigChange_agentId_partition_idx" ON "ConfigChange"("agentId", "partition");

-- CreateIndex
CREATE INDEX "ConfigChange_changedAt_idx" ON "ConfigChange"("changedAt");

-- CreateIndex
CREATE INDEX "Feedback_agentId_status_idx" ON "Feedback"("agentId", "status");

-- CreateIndex
CREATE INDEX "Feedback_submittedAt_idx" ON "Feedback"("submittedAt");

-- CreateIndex
CREATE INDEX "Feedback_severity_status_idx" ON "Feedback"("severity", "status");

-- CreateIndex
CREATE INDEX "Release_agentId_status_idx" ON "Release"("agentId", "status");

-- CreateIndex
CREATE INDEX "Release_submittedAt_idx" ON "Release"("submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentVersion_releaseId_key" ON "AgentVersion"("releaseId");

-- CreateIndex
CREATE INDEX "AgentVersion_agentId_publishedAt_idx" ON "AgentVersion"("agentId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentVersion_agentId_version_key" ON "AgentVersion"("agentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- CreateIndex
CREATE INDEX "Skill_category_status_idx" ON "Skill"("category", "status");

-- CreateIndex
CREATE INDEX "SkillVersion_skillId_idx" ON "SkillVersion"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillVersion_skillId_version_key" ON "SkillVersion"("skillId", "version");

-- CreateIndex
CREATE INDEX "AgentSkillBinding_agentId_idx" ON "AgentSkillBinding"("agentId");

-- CreateIndex
CREATE INDEX "AgentSkillBinding_skillId_idx" ON "AgentSkillBinding"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSkillBinding_agentId_skillId_key" ON "AgentSkillBinding"("agentId", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "WikiVault_agentId_key" ON "WikiVault"("agentId");

-- CreateIndex
CREATE INDEX "WikiVault_isShared_idx" ON "WikiVault"("isShared");

-- CreateIndex
CREATE INDEX "WikiPage_vaultId_lifecycle_idx" ON "WikiPage"("vaultId", "lifecycle");

-- CreateIndex
CREATE INDEX "WikiPage_vaultId_tier_idx" ON "WikiPage"("vaultId", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "WikiPage_vaultId_slug_key" ON "WikiPage"("vaultId", "slug");

-- CreateIndex
CREATE INDEX "WikiIngestJob_vaultId_status_idx" ON "WikiIngestJob"("vaultId", "status");

-- CreateIndex
CREATE INDEX "WikiIngestJob_jobType_status_idx" ON "WikiIngestJob"("jobType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_resource_action_key" ON "Permission"("resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_productGroupId_key" ON "UserRole"("userId", "roleId", "productGroupId");

-- CreateIndex
CREATE INDEX "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Trace_agentId_createdAt_idx" ON "Trace"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "EvalCase_agentId_createdAt_idx" ON "EvalCase"("agentId", "createdAt");
