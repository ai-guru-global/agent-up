import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "lib/__tests__/**/*.test.ts",
      "app/api/__tests__/**/*.test.ts",
    ],
    server: {
      deps: {
        inline: ["@agent-up/db"],
      },
    },
    // 限制并发 worker：每个 worker 的 PrismaClient 独立建连接池，批1 起
    // 测试文件全部连 PG，不限制会耗尽 PG 默认 100 连接（maxWorkers 对
    // forks/threads 两种 pool 都生效；Vitest 3 默认 pool 是 forks）
    maxWorkers: 4,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      include: [
        "lib/errors.ts",
        "lib/context.ts",
        "lib/versioning.ts",
        "lib/diff.ts",
        "lib/schemas.ts",
        "lib/utils.ts",
        "lib/data/store.ts",
        "lib/services/**/*.ts",
      ],
      exclude: ["lib/__tests__/**", "lib/services/audit-service.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
