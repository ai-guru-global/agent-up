---
kind: build_system
name: Monorepo 构建与制品管理（pnpm + Turbo）
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - turbo.json
    - pnpm-workspace.yaml
    - apps/web/package.json
    - apps/web/next.config.ts
    - apps/web/vitest.config.ts
    - scripts/export.sh
    - docker-compose.yml
---

### 1. 使用的系统与工具
- **包管理器**：pnpm（`packageManager: "pnpm@9.15.0"`，Node `>=20`），通过 `pnpm-workspace.yaml` 声明 `apps/*` 与 `packages/*` 两个工作区。
- **任务编排与缓存**：Turbo v2（`turbo.json`），统一协调 dev/build/lint/db:* 等跨包任务，并启用基于输入/输出的增量缓存。
- **应用框架**：Next.js 16（App Router），在 `apps/web` 中通过 `next build` 生成 `.next` 产物。
- **测试**：Vitest 3（`vitest.config.ts`），配合 `@vitest/coverage-v8` 生成覆盖率报告。
- **容器化**：`docker-compose.yml` 提供 Postgres 16 与 MinIO 本地依赖服务，未包含应用镜像构建。
- **制品打包**：`scripts/export.sh` 将 Next.js 构建产物与运行时依赖打包为独立 tarball，供部署使用。

### 2. 关键文件与位置
- 根级编排：`package.json`、`turbo.json`、`pnpm-workspace.yaml`、`tsconfig.json`
- Web 应用：`apps/web/package.json`、`apps/web/next.config.ts`、`apps/web/vitest.config.ts`
- 共享包：`packages/{db,shared,ui}/`（由 workspace 统一管理）
- 脚本与依赖服务：`scripts/export.sh`、`docker-compose.yml`

### 3. 架构与约定
- **Monorepo 分层**：`apps/web` 是唯一的业务应用；`packages/{db,shared,ui}` 为共享库，通过 `workspace:*` 引用，避免重复安装。
- **任务依赖图**：`turbo.json` 规定 `build` 依赖上游包的 `^build` 与 `^db:generate`；`dev` 禁用缓存并标记为 persistent；lint 依赖上游构建完成。
- **环境变量**：`.env` 被加入 `globalDependencies`，任何 `.env*` 变更都会使缓存失效，保证构建一致性。
- **输出路径**：构建产物集中在 `.next/**` 与 `dist/**`（排除 `.next/cache`），便于 Turbo 增量缓存与后续打包。
- **数据库流程**：通过 `turbo run db:generate | db:push | db:migrate` 统一触发 Prisma 相关命令，开发时由 `dev` 任务前置执行 `db:generate`。
- **本地依赖服务**：Postgres 与 MinIO 通过 docker-compose 启动，端口 5432/9000/9001，具备 healthcheck 保障就绪顺序。

### 4. 约定与约束
- **Node 版本**：根 `engines.node >= 20`，所有子包需满足该要求。
- **包管理器锁定**：使用 `pnpm-lock.yaml` 与 `package-lock.json` 双重锁定，确保依赖解析一致。
- **构建入口**：开发者统一通过 `pnpm dev/build/lint/clean` 调用 Turbo，禁止直接在各子包内运行 npm/pnpm 脚本绕过编排。
- **缓存策略**：除 `dev`、`db:*`、`clean` 明确关闭缓存外，其余任务均启用 Turbo 缓存；`inputs` 包含 `$TURBO_DEFAULT$` 与 `.env*`。
- **制品规范**：`scripts/export.sh` 固定输出目录 `dist/agent-up-web/`，仅拷贝 `.next`、`public`、`data` 与配置文件，并生成最小化 `package.json` 与 `start.sh` 启动脚本。
- **测试约定**：Web 应用通过 `pnpm test`（Vitest）运行，覆盖率由 `@vitest/coverage-v8` 生成至 `coverage/` 目录。
- **API 路由与数据**：Next.js App Router 的 `app/api/*` 与 `data/*.json` fixtures 随构建一起打包，无需额外后端服务即可本地运行。