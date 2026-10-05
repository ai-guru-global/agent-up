import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { config } from "dotenv";
import { TEST_WORKER_DBS } from "./worker-count";
import { workerDbFile, workerDbUrl } from "./worker-db-path";

/**
 * globalSetup（主进程一次性执行）：为每个 vitest worker 准备独立 SQLite 文件库。
 *
 * SQLite 迁移（2026-10-05）：隔离单位从「PG 数据库」变为「文件」——
 * 无 CREATE DATABASE，先删旧文件（含 -journal 残留）保证干净，再对该文件
 * 跑 migrate deploy 应用基线迁移。
 */
export default async function prepareWorkerDbs(): Promise<void> {
  config(); // apps/web/.env
  if (!process.env.DATABASE_URL) config({ path: "../../packages/db/.env" });
  if (!process.env.DATABASE_URL) {
    throw new Error("测试需要 DATABASE_URL（见 .env.example 数据库一节）");
  }

  for (let i = 1; i <= TEST_WORKER_DBS; i++) {
    const dbFile = workerDbFile(i);
    rmSync(dbFile, { force: true });
    rmSync(`${dbFile}-journal`, { force: true });
    rmSync(`${dbFile}-wal`, { force: true });
    applyMigrations(workerDbUrl(i));
  }
}

function applyMigrations(workerUrl: string): void {
  execFileSync(
    "pnpm",
    ["--filter", "@agent-up/db", "exec", "prisma", "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: workerUrl },
      stdio: "pipe",
    },
  );
}
