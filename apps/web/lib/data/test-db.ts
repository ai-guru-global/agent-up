/**
 * 测试专用：清空数据库全部业务表（批0 基建；2026-10-05 SQLite 迁移起为
 * 「按依赖序 deleteMany」——SQLite 无 TRUNCATE，也不再依赖 pg_tables）。
 * 仅限 vitest 测试环境使用，生产代码不得导入。
 */
import "dotenv/config";
import { prisma } from "@agent-up/db";

if (!process.env.VITEST) {
  throw new Error("test-db 是测试专用模块（清库），仅限 vitest 环境导入");
}

/**
 * 与 packages/db/prisma/seed.mjs 的 clearAll 同序：子表在前，
 * AgentVersion.releaseId 等 FK 依赖先清。
 */
export async function _resetDb(): Promise<void> {
  await prisma.agentVersion.deleteMany();
  await prisma.release.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.evalCase.deleteMany();
  await prisma.trace.deleteMany();
  await prisma.configChange.deleteMany();
  await prisma.agentDraftConfig.deleteMany();
  await prisma.promptConfig.deleteMany();
  await prisma.toolsConfig.deleteMany();
  await prisma.routingConfig.deleteMany();
  await prisma.knowledgeConfig.deleteMany();
  await prisma.agentSkillBinding.deleteMany();
  await prisma.skillVersion.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.wikiPage.deleteMany();
  await prisma.wikiIngestJob.deleteMany();
  await prisma.wikiVault.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.productGroupMember.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.productGroup.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.user.deleteMany();
}
