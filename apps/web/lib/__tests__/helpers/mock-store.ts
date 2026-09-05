/**
 * 测试隔离辅助。
 *
 * 通过 store._setDataDir 把数据根目录指向一个临时目录，
 * 并把仓库种子数据复制进去——每个测试文件独立副本，绝不污染真实 data/。
 *
 * 用法（测试文件顶部）：
 *   import { useTempDataDir, seedPath } from "../helpers/mock-store";
 *   beforeEach(() => useTempDataDir());
 *   afterEach(() => restoreDataDir());
 */
import { mkdtempSync, cpSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { _setDataDir } from "@/lib/data/store";

/** 仓库里的真实种子数据目录（apps/web/data） */
export const seedDataDir = join(process.cwd(), "data");

let tmpDir: string | null = null;

/**
 * 创建临时目录 + 复制种子数据 + 设置 store 数据根。
 * 每个 test 前调用，保证测试间干净状态。
 */
export function useTempDataDir(): void {
  tmpDir = mkdtempSync(join(tmpdir(), "agentup-test-"));
  // 把种子数据复制进临时目录的 data/ 子目录
  cpSync(seedDataDir, join(tmpDir, "data"), { recursive: true });
  _setDataDir(join(tmpDir, "data"));
}

/** 测试后恢复 store 数据根为默认（并清理临时目录） */
export function restoreDataDir(): void {
  _setDataDir(null);
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
}
