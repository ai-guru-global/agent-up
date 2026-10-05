import { fileURLToPath } from "node:url";

/**
 * worker 专属 SQLite 文件库的路径与 URL。
 *
 * globalSetup（建库）与 setupFiles（worker 进程改写 DATABASE_URL）必须用
 * 同一锚点计算路径，这里统一以本文件所在目录为基准上跳三级到 apps/web。
 *
 * 必须用绝对路径：Prisma 对 file: 相对路径按 schema.prisma 所在目录解析，
 * worker 进程的 CWD 与之不一致时会静默连到别的文件。
 */

export function workerDbFile(poolId: string | number): string {
  return fileURLToPath(
    new URL(`../../../agentup_test_w${poolId}.db`, import.meta.url),
  );
}

export function workerDbUrl(poolId: string | number): string {
  return `file:${workerDbFile(poolId)}`;
}
