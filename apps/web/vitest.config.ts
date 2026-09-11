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
        "lib/versioning.ts",
        "lib/diff.ts",
        "lib/schemas.ts",
        "lib/utils.ts",
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
