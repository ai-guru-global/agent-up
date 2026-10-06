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
        "app/api/**/route.ts",
      ],
      // audit-service.ts 曾被单独排除。但它有 9 个专属用例（audit-service.test.ts），
      // 且被 15 个测试文件间接引用——把「问责层」排除在覆盖率门禁之外是反的。
      //
      // app/api/**/route.ts（40 个）已于批⑦纳入。三组数按同一 config 实测：
      //   扩围前（旧 include，502 用例）97.39% / 83.84% / 99.29%（3025/3106 行）
      //   只扩围不补测（旧 464 用例）    93.51% / 81.93% / 97.04%（4313/4612 行）
      //   扩围 + 补测（最终门禁态）      97.10% / 83.96% / 99.52%（4458/4591 行）
      // 三组均高于下方阈值，所以阈值原样未动——这条顺序是硬约束：任何情况下都不应
      // 为了让扩围通过而下调现有阈值，只能补测试或（实测确实更低时）加 per-glob 阈值。
      // 纳入时清掉的 5 个 0% 路由：auth/logout、skills/[id]、wiki/vaults/[id]、
      // wiki/vaults/[id]/pages、wiki/pages/[id]（见 app/api/__tests__/ 三份新文件）。
      // 已知残留（有意不为）：maas/usage 等路由的兜底 catch（L15-16）防御分支未覆盖——
      // 补它们要引入 vi.mock/vi.spyOn，本仓零先例，得不偿失。
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
