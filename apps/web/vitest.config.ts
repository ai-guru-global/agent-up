import { defineConfig } from "vitest/config";
import path from "path";
import { TEST_WORKER_DBS } from "./lib/__tests__/setup/worker-count";

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
    // worker 数 = 独立测试库数（见 lib/__tests__/setup/prepare-worker-dbs.ts）
    maxWorkers: TEST_WORKER_DBS,
    globalSetup: ["./lib/__tests__/setup/prepare-worker-dbs.ts"],
    setupFiles: ["./lib/__tests__/setup/worker-db-env.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      include: [
        "lib/errors.ts",
        "lib/context.ts",
        "lib/auth-token.ts",
        "lib/versioning.ts",
        "lib/diff.ts",
        "lib/schemas.ts",
        "lib/utils.ts",
        "lib/retrieval-bm25.ts",
        "lib/services/**/*.ts",
      ],
      // audit-service.ts 曾被单独排除。但它有 9 个专属用例（audit-service.test.ts），
      // 且被 15 个测试文件间接引用——把「问责层」排除在覆盖率门禁之外是反的。
      //
      // 已知盲区（有意保留，勿盲目扩围）：app/api/**/route.ts（39 个）未纳入 include。
      // 阈值是全局聚合而非 per-file，未先测出基线就扩围可能把整体拉到 80 以下而挂 CI。
      // 纳入前必须先跑 `pnpm test -- --coverage` 量出实际数字，再决定是抬阈值还是加
      // per-glob 阈值；任何情况下都不应为了让扩围通过而下调现有阈值。
      exclude: ["lib/__tests__/**"],
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
