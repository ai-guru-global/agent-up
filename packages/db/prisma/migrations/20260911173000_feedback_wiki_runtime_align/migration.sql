-- Feedback.source：枚举 → 文本（运行时存渠道名 generic/ticket-webhook，渠道集合开放）
ALTER TABLE "Feedback" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "Feedback" ALTER COLUMN "source" TYPE TEXT USING "source"::text;
ALTER TABLE "Feedback" ALTER COLUMN "source" SET DEFAULT 'MANUAL';
DROP TYPE "FeedbackSource";

-- Feedback：多渠道工单外部单号平铺列（幂等键），响应层重组 externalRef 对象
ALTER TABLE "Feedback" ADD COLUMN "externalRefId" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "externalRefUrl" TEXT;

-- AgentSkillBinding.allowedScopes：运行时无此字段，空数组默认
ALTER TABLE "AgentSkillBinding" ALTER COLUMN "allowedScopes" SET DEFAULT '{}'::text[];

-- Wiki 三枚举换型为新旧两套值域的并集：存量值（REVIEWED/SUPPORTING/EXTRACTED 等）
-- 与 zod 新值（IN_REVIEW/SPECIALIZED/EDGE_CASE 等）都需能落库，存量行直接 text cast
CREATE TYPE "PageLifecycle_new" AS ENUM ('DRAFT', 'REVIEWED', 'VERIFIED', 'DISPUTED', 'ARCHIVED', 'IN_REVIEW', 'STALE', 'DEPRECATED');
ALTER TABLE "WikiPage" ALTER COLUMN "lifecycle" DROP DEFAULT;
ALTER TABLE "WikiPage" ALTER COLUMN "lifecycle" TYPE "PageLifecycle_new" USING "lifecycle"::text::"PageLifecycle_new";
ALTER TABLE "WikiPage" ALTER COLUMN "lifecycle" SET DEFAULT 'DRAFT';
DROP TYPE "PageLifecycle";
ALTER TYPE "PageLifecycle_new" RENAME TO "PageLifecycle";

CREATE TYPE "PageTier_new" AS ENUM ('CORE', 'SUPPORTING', 'PERIPHERAL', 'SPECIALIZED', 'EDGE_CASE');
ALTER TABLE "WikiPage" ALTER COLUMN "tier" DROP DEFAULT;
ALTER TABLE "WikiPage" ALTER COLUMN "tier" TYPE "PageTier_new" USING "tier"::text::"PageTier_new";
ALTER TABLE "WikiPage" ALTER COLUMN "tier" SET DEFAULT 'SPECIALIZED';
DROP TYPE "PageTier";
ALTER TYPE "PageTier_new" RENAME TO "PageTier";

CREATE TYPE "Provenance_new" AS ENUM ('EXTRACTED', 'INFERRED', 'AMBIGUOUS', 'SYNTHESIZED', 'AUTHORED', 'DISTILLED', 'IMPORTED');
ALTER TABLE "WikiPage" ALTER COLUMN "provenance" DROP DEFAULT;
ALTER TABLE "WikiPage" ALTER COLUMN "provenance" TYPE "Provenance_new" USING "provenance"::text::"Provenance_new";
ALTER TABLE "WikiPage" ALTER COLUMN "provenance" SET DEFAULT 'EXTRACTED';
DROP TYPE "Provenance";
ALTER TYPE "Provenance_new" RENAME TO "Provenance";

-- Vault 删除级联：运行时 deleteVault = 整库连页面一起消失，RESTRICT 会撞 P2003
ALTER TABLE "WikiPage" DROP CONSTRAINT "WikiPage_vaultId_fkey";
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "WikiVault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiIngestJob" DROP CONSTRAINT "WikiIngestJob_vaultId_fkey";
ALTER TABLE "WikiIngestJob" ADD CONSTRAINT "WikiIngestJob_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "WikiVault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
