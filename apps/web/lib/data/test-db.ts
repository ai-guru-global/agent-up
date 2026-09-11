/**
 * 测试专用：清空数据库全部业务表（批0 基建，批5 起为唯一的测试隔离手段）。
 * 仅限 vitest 测试环境使用，生产代码不得导入。
 */
import "dotenv/config";
import { prisma } from "@agent-up/db";

if (!process.env.VITEST) {
  throw new Error("test-db 是测试专用模块（TRUNCATE 清库），仅限 vitest 环境导入");
}

const RESERVED_TABLES = new Set(["_prisma_migrations"]);

export async function _resetDb(): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const tables = rows
    .map((r) => r.tablename)
    .filter((t) => !RESERVED_TABLES.has(t));
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}
