-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('LEAD', 'MEMBER');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SearchStrategy" AS ENUM ('WIKI_FIRST', 'WIKI_ONLY', 'MCP_FIRST', 'HYBRID');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SYNCED', 'SYNCING', 'OUT_OF_SYNC', 'ERROR');

-- CreateEnum
CREATE TYPE "ConfigPartition" AS ENUM ('PROMPT', 'KNOWLEDGE', 'TOOLS', 'ROUTING');

-- CreateEnum
CREATE TYPE "FeedbackSource" AS ENUM ('MANUAL', 'API', 'SESSION_IMPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "FeedbackRating" AS ENUM ('POSITIVE', 'NEGATIVE', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "FeedbackTag" AS ENUM ('ANSWER_QUALITY', 'KNOWLEDGE_GAP', 'TOOL_FAILURE', 'ROUTING_ERROR', 'HALLUCINATION', 'OUTDATED_INFO', 'TONE_ISSUE', 'INCOMPLETE', 'OFF_TOPIC');

-- CreateEnum
CREATE TYPE "FeedbackSeverity" AS ENUM ('CRITICAL', 'MAJOR', 'MINOR', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'CLOSED', 'WONTFIX');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "SkillCategory" AS ENUM ('KNOWLEDGE_QUERY', 'DATA_FETCH', 'ACTION', 'TRANSFORM', 'GENERAL');

-- CreateEnum
CREATE TYPE "SkillRuntime" AS ENUM ('HTTP', 'FUNCTION', 'MCP', 'WORKFLOW');

-- CreateEnum
CREATE TYPE "SkillStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Provenance" AS ENUM ('EXTRACTED', 'INFERRED', 'AMBIGUOUS', 'SYNTHESIZED');

-- CreateEnum
CREATE TYPE "PageLifecycle" AS ENUM ('DRAFT', 'REVIEWED', 'VERIFIED', 'DISPUTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PageTier" AS ENUM ('CORE', 'SUPPORTING', 'PERIPHERAL');

-- CreateEnum
CREATE TYPE "WikiJobType" AS ENUM ('INGEST', 'UPDATE', 'SYNTHESIZE', 'LINT', 'DEDUP');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ProductGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductGroupMember" (
    "id" TEXT NOT NULL,
    "productGroupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GroupRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "productGroupId" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptConfig" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "roleDefinition" TEXT,
    "constraints" TEXT[],
    "outputFormat" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastModifiedBy" TEXT,
    "lastModifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeConfig" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "wikiVaultId" TEXT,
    "searchStrategy" "SearchStrategy" NOT NULL DEFAULT 'WIKI_FIRST',
    "fallbackToMcp" BOOLEAN NOT NULL DEFAULT true,
    "maxWikiResults" INTEGER NOT NULL DEFAULT 5,
    "confidenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "lastSyncAt" TIMESTAMP(3),
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastModifiedBy" TEXT,
    "lastModifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolsConfig" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "mcpTools" JSONB NOT NULL,
    "wikiQueryTools" JSONB NOT NULL,
    "maxConcurrentCalls" INTEGER NOT NULL DEFAULT 3,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "retryCount" INTEGER NOT NULL DEFAULT 2,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastModifiedBy" TEXT,
    "lastModifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingConfig" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "escalationPolicy" JSONB,
    "humanThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "maxConversationTurns" INTEGER NOT NULL DEFAULT 10,
    "idleTimeoutMinutes" INTEGER NOT NULL DEFAULT 5,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastModifiedBy" TEXT,
    "lastModifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDraftConfig" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "promptConfig" JSONB,
    "knowledgeConfig" JSONB,
    "toolsConfig" JSONB,
    "routingConfig" JSONB,
    "isDirty" BOOLEAN NOT NULL DEFAULT false,
    "lastSavedBy" TEXT,
    "lastSavedAt" TIMESTAMP(3),

    CONSTRAINT "AgentDraftConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigChange" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "partition" "ConfigPartition" NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "diff" JSONB NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeNote" TEXT,
    "releaseId" TEXT,

    CONSTRAINT "ConfigChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "source" "FeedbackSource" NOT NULL DEFAULT 'MANUAL',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sessionData" JSONB,
    "rating" "FeedbackRating" NOT NULL,
    "tags" "FeedbackTag"[],
    "severity" "FeedbackSeverity" NOT NULL DEFAULT 'MINOR',
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "assignedTo" TEXT,
    "assignedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "releaseId" TEXT,
    "ingestJobId" TEXT,
    "targetPartition" "ConfigPartition",
    "submittedBy" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "verificationNote" TEXT,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "changeNote" TEXT NOT NULL,
    "changedPartitions" "ConfigPartition"[],
    "status" "ReleaseStatus" NOT NULL DEFAULT 'PENDING',
    "submittedBy" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "configSnapshot" JSONB,
    "aiReview" JSONB,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentVersion" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "major" INTEGER NOT NULL,
    "minor" INTEGER NOT NULL,
    "patch" INTEGER NOT NULL,
    "promptSnapshot" JSONB NOT NULL,
    "knowledgeSnapshot" JSONB NOT NULL,
    "toolsSnapshot" JSONB NOT NULL,
    "routingSnapshot" JSONB NOT NULL,
    "releaseId" TEXT NOT NULL,
    "wikiCommitSha" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT NOT NULL,
    "changeNote" TEXT NOT NULL,
    "effectivenessReport" JSONB,

    CONSTRAINT "AgentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "SkillCategory" NOT NULL DEFAULT 'GENERAL',
    "triggerPatterns" TEXT[],
    "inputSchema" JSONB NOT NULL,
    "outputSchema" JSONB NOT NULL,
    "runtime" "SkillRuntime" NOT NULL DEFAULT 'HTTP',
    "endpoint" TEXT,
    "codeRef" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "dependencies" TEXT[],
    "permissions" TEXT[],
    "status" "SkillStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillVersion" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "changelog" TEXT,
    "snapshot" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSkillBinding" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "config" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "allowedScopes" TEXT[],
    "boundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "boundBy" TEXT NOT NULL,

    CONSTRAINT "AgentSkillBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiVault" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "agentId" TEXT,
    "gitRepoUrl" TEXT,
    "gitBranch" TEXT NOT NULL DEFAULT 'main',
    "lastCommitSha" TEXT,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "avgConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "orphanCount" INTEGER NOT NULL DEFAULT 0,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "sharedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikiVault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiPage" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "provenance" "Provenance" NOT NULL DEFAULT 'EXTRACTED',
    "lifecycle" "PageLifecycle" NOT NULL DEFAULT 'DRAFT',
    "tier" "PageTier" NOT NULL DEFAULT 'SUPPORTING',
    "baseConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "sourceRefs" JSONB NOT NULL,
    "wikilinks" TEXT[],
    "categories" TEXT[],
    "tags" TEXT[],
    "filePath" TEXT NOT NULL,
    "lastCommitSha" TEXT,
    "inboundLinks" INTEGER NOT NULL DEFAULT 0,
    "outboundLinks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "WikiPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiIngestJob" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "jobType" "WikiJobType" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceContent" TEXT,
    "sourceUrl" TEXT,
    "generatedPageIds" TEXT[],
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "triggeredBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiIngestJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "productGroupId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "details" JSONB,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trace" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "history" JSONB NOT NULL,
    "message" TEXT NOT NULL,
    "reply" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "usage" JSONB NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating" TEXT,
    "ratedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "Trace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalCase" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sourceTraceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "expectation" TEXT NOT NULL,
    "assertions" JSONB,
    "systemPrompt" TEXT NOT NULL,
    "history" JSONB NOT NULL,
    "message" TEXT NOT NULL,
    "referenceReply" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "EvalCase_pkey" PRIMARY KEY ("id")
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

-- AddForeignKey
ALTER TABLE "ProductGroupMember" ADD CONSTRAINT "ProductGroupMember_productGroupId_fkey" FOREIGN KEY ("productGroupId") REFERENCES "ProductGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductGroupMember" ADD CONSTRAINT "ProductGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_productGroupId_fkey" FOREIGN KEY ("productGroupId") REFERENCES "ProductGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptConfig" ADD CONSTRAINT "PromptConfig_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeConfig" ADD CONSTRAINT "KnowledgeConfig_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeConfig" ADD CONSTRAINT "KnowledgeConfig_wikiVaultId_fkey" FOREIGN KEY ("wikiVaultId") REFERENCES "WikiVault"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolsConfig" ADD CONSTRAINT "ToolsConfig_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingConfig" ADD CONSTRAINT "RoutingConfig_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDraftConfig" ADD CONSTRAINT "AgentDraftConfig_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigChange" ADD CONSTRAINT "ConfigChange_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillVersion" ADD CONSTRAINT "SkillVersion_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSkillBinding" ADD CONSTRAINT "AgentSkillBinding_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSkillBinding" ADD CONSTRAINT "AgentSkillBinding_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiVault" ADD CONSTRAINT "WikiVault_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "WikiVault"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiIngestJob" ADD CONSTRAINT "WikiIngestJob_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "WikiVault"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trace" ADD CONSTRAINT "Trace_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalCase" ADD CONSTRAINT "EvalCase_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
