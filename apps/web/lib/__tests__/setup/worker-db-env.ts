import { config } from "dotenv";
import { workerDbUrl } from "./worker-db-path";

/**
 * setupFiles：每个测试文件执行前在 worker 进程内运行（先于任何测试模块导入，
 * 因此 @agent-up/db 的 PrismaClient 构造时读到的已是本 worker 专属 URL）。
 *
 * SQLite 迁移（2026-10-05）：PG 时代按 URL pathname 切库；SQLite 下改为
 * 每 worker 一个独立 .db 文件（路径见 worker-db-path.ts）。
 */
config(); // apps/web/.env
if (!process.env.DATABASE_URL) config({ path: "../../packages/db/.env" });
if (!process.env.DATABASE_URL) {
  throw new Error("测试需要 DATABASE_URL（见 .env.example 数据库一节）");
}

const poolId = process.env.VITEST_POOL_ID ?? "1";
process.env.DATABASE_URL = workerDbUrl(poolId);
