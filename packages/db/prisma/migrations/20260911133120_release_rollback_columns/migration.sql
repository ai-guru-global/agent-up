-- AlterTable
ALTER TABLE "Release" ADD COLUMN     "isRollback" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rollbackFromVersion" TEXT,
ADD COLUMN     "rollbackToVersionId" TEXT;
