---
kind: build_system
name: 基于 pnpm + Turborepo 的 Next.js Monorepo 构建系统
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - turbo.json
    - pnpm-workspace.yaml
    - apps/web/package.json
    - scripts/export.sh
    - docker-compose.yml
    - packages/shared/package.json
    - packages/db/package.json
    - packages/ui/package.json
---

## 1. 使用的系统与工具

- **包管理器**：pnpm（`packageManager: "pnpm@9.15.0"`，Node `>=20`），通过根 `package.json` 锁定版本。
- **Monorepo 工作区**：`pnpm-workspace.yaml` 声明 `apps/*` 与 `packages/*` 两个工作区目录。
- **任务编排/缓存**：Turborepo v2（`turbo ^2.5.0`），在根 `turbo.json` 中定义全局任务、依赖顺序与输出缓存。
- **前端框架**：Next.js 16（App Router），使用 Turbopack 开发（`next dev --turbopack`）。
- **数据库**：Prisma（`packages/db` 含 `schema.prisma`），通过 `db:generate / db:push / db:migrate` 任务管理。
- **测试**：Vitest 3（`vitest run`，配合 `@vitest/coverage-v8` 生成覆盖率报告到 `apps/web/coverage/`）。
- **Lint**：ESLint 9（`eslint.config.mjs`，`eslint-config-next`）。
- **容器化**：无 Dockerfile；使用 `docker-compose.yml` 仅启动 Postgres 16 与 MinIO 作为本地开发依赖服务。
- **打包分发**：自定义脚本 `scripts/export.sh` 将 Next.js 产物打包为可独立部署的 tarball。

## 2. 关键文件

| 文件 | 作用 |
|---|---|
| `package.json` | 根入口，暴露 `dev/build/lint/db:*` 等统一脚本，声明 pnpm 与 Node 引擎约束 |
| `turbo.json` | 定义 `build/dev/lint/db:generate/push/migrate/clean` 任务、依赖关系与缓存策略 |
| `pnpm-workspace.yaml` | 声明 workspace 范围 `apps/*`, `packages/*` |
| `apps/web/package.json` | Web 应用脚本（`dev --turbopack`, `build`, `start`, `test`, `clean`），引用 `workspace:*` 内部包 |
| `scripts/export.sh` | 构建 → 复制 `.next/public/data` → 生成最小 `package.json` + `start.sh` → 打 tarball |
| `docker-compose.yml` | 本地 Postgres + MinIO 服务，带 healthcheck |
| `packages/*/package.json` & `tsconfig.json` | shared/db/ui 三个内部包的元数据与 TS 配置 |

## 3. 架构与约定

### 3.1 任务图与缓存
- `build` 任务依赖 `^build`（所有上游包先 build）和 `^db:generate`（Prisma client 先生成），确保跨包依赖顺序正确。
- `build` 的输出缓存目录为 `.next/**` 与 `dist/**`（排除 `.next/cache`），利用 Turborepo 远程/本地缓存加速二次构建。
- `dev` 禁用缓存且标记 `persistent`，避免热重载被缓存干扰。
- `db:*` 与 `clean` 全部禁用缓存，因为它们是副作用型操作。
- 全局依赖包含 `.env` 与 `.env*`，环境变量变化会触发重新构建。

### 3.2 Monorepo 包划分
- `apps/web`：唯一的 Next.js 应用，既是前端页面也是 API Routes（`app/api/*`）。
- `packages/shared`：共享类型与 schema（Zod），被 web 以 `workspace:*` 引用。
- `packages/db`：Prisma schema + 客户端封装，提供 `db:generate` 等任务。
- `packages/ui`：UI 组件库（当前为空壳，预留）。

### 3.3 构建产物与发布流程
- 开发：`pnpm dev` → Turbo 调度 `apps/web` 的 `next dev --turbopack`，同时触发 `db:generate`。
- 生产构建：`pnpm build` → Turbo 按拓扑序执行各包 `build`，最终产出 `apps/web/.next`。
- 打包分发：`scripts/export.sh` 将 `.next`、`public`、`data` 及 `next.config.ts` 复制到 `dist/agent-up-web/`，生成精简 `package.json`（仅运行时依赖 next/react/zod）与 `start.sh`，最后打成 `agent-up.tar.gz`。该脚本是仓库内唯一的“发布”步骤，未集成 CI 流水线。

### 3.4 本地基础设施
- 通过 `docker-compose.yml` 启动 Postgres 16（端口 5432，健康检查 `pg_isready`）与 MinIO（S3 兼容对象存储，端口 9000/9001，健康检查 `mc ready local`），供 Next.js API 与 Wiki vault 快照使用。

## 4. 约定与约束

- **Node 版本**：根 `engines.node >= 20`，pnpm 锁定 9.15.0，强制团队与环境一致。
- **Workspace 协议**：内部包一律通过 `workspace:*` 引用（如 `@agent-up/shared`），禁止硬编码版本号。
- **任务命名**：所有子包需实现 `build`、`dev`、`lint`、`clean` 以及 `db:generate/push/migrate` 中的相关命令，否则 Turbo 无法编排。
- **环境变量**：`.env` 变更会触发全量重构建（`globalDependencies` 包含 `.env`），敏感配置不得硬编码进构建产物。
- **构建输出**：生产构建产物位于 `apps/web/.next`，由 export 脚本直接拷贝，不经过额外的 bundle 步骤。
- **测试**：单元测试通过 `pnpm test`（即 `vitest run`）运行，覆盖率报告输出至 `apps/web/coverage/`。
- **无 CI/Dockerfile**：仓库未发现 GitHub Actions、GitLab CI 或 Dockerfile；发布目前依赖手动执行 `scripts/export.sh` 并上传 tarball。
- **数据库迁移**：通过 `pnpm db:push`（开发直推）与 `pnpm db:migrate`（生产迁移）区分环境，迁移前必须 `db:generate`。

## 5. 缺失项说明

- 未发现 CI/CD 配置文件（`.github/workflows`、`.gitlab-ci.yml` 等）。
- 未发现 Dockerfile；容器化仅用于本地依赖服务（Postgres、MinIO）。
- 未发现版本化管理脚本（如 changelog、semver 自动递增），版本号为固定 `0.1.0`。
- 未发现多平台交叉编译配置（Next.js 静态产物本身不涉及 C/C++ 交叉编译）。