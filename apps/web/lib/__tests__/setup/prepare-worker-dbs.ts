import { execFileSync } from "node:child_process";
import { config } from "dotenv";
import { PrismaClient } from "@agent-up/db";
import { TEST_WORKER_DBS } from "./worker-count";

/**
 * globalSetup（主进程一次性执行）：为每个 vitest worker 准备独立数据库。
 * 替代批0 的「单库 TRUNCATE 串行化」——多 worker 并发跑 PG 套件时互不干扰。
 */
export default async function prepareWorkerDbs(): Promise<void> {
  config(); // apps/web/.env
  if (!process.env.DATABASE_URL) config({ path: "../../packages/db/.env" });
  if (!process.env.DATABASE_URL) {
    throw new Error("测试需要 DATABASE_URL（见 .env.example 数据库一节）");
  }

  const base = new URL(process.env.DATABASE_URL);
  for (let i = 1; i <= TEST_WORKER_DBS; i++) {
    const dbName = `agentup_test_w${i}`;
    await ensureDatabase(base, dbName);
    applyMigrations(base, dbName);
  }
}

async function ensureDatabase(base: URL, dbName: string): Promise<void> {
  const admin = new URL(base);
  admin.pathname = "/postgres";
  const client = new PrismaClient({ datasourceUrl: admin.toString() });
  try {
    await client.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } catch (err) {
    // 42P04 = database already exists，复用即目标
    if (!(err instanceof Error && /42P04|already exists/.test(err.message))) throw err;
  } finally {
    await client.$disconnect();
  }
}

function applyMigrations(base: URL, dbName: string): void {
  const workerUrl = new URL(base);
  workerUrl.pathname = `/${dbName}`;
  execFileSync(
    "pnpm",
    ["--filter", "@agent-up/db", "exec", "prisma", "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: workerUrl.toString() },
      stdio: "pipe",
    },
  );
}
