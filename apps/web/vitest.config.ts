import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "lib/__tests__/**/*.test.ts",
      "app/api/__tests__/**/*.test.ts",
    ],
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
