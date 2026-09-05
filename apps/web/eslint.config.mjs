import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 构建产物与覆盖率报告：不应被 lint（此前遗漏导致 demo-deploy/dist
    // 压缩 chunk 报上万条 error/warning，pnpm lint 恒失败）
    "dist/**",
    "coverage/**",
    "demo-deploy/**",
  ]),
  // no-unused-vars 覆盖 nextTs 默认值：项目约定以 _ 前缀表达「有意忽略」
  // （如 POST(_request)）；rest 解构剔除字段（如回滚快照排除
  // version/lastModifiedAt）属于有意忽略，不应报未使用。
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
]);

export default eslintConfig;
