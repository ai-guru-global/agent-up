import { config } from "dotenv";

/**
 * setupFiles：每个测试文件执行前在 worker 进程内运行（先于任何测试模块导入，
 * 因此 @agent-up/db 的 PrismaClient 构造时读到的已是本 worker 专属 URL）。
 */
config(); // apps/web/.env
if (!process.env.DATABASE_URL) config({ path: "../../packages/db/.env" });
if (!process.env.DATABASE_URL) {
  throw new Error("测试需要 DATABASE_URL（见 .env.example 数据库一节）");
}

const poolId = process.env.VITEST_POOL_ID ?? "1";
const base = new URL(process.env.DATABASE_URL);
base.pathname = `/agentup_test_w${poolId}`;
process.env.DATABASE_URL = base.toString();
