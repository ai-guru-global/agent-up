---
kind: build_system
name: Monorepo 构建与打包系统（pnpm + Turbo + Docker Compose）
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - turbo.json
    - pnpm-workspace.yaml
    - docker-compose.yml
    - scripts/export.sh
    - apps/web/package.json
    - packages/shared/package.json
    - packages/ui/package.json
    - packages/db/package.json
---

该项目采用基于 pnpm workspace 的 monorepo 架构，使用 Turbo 作为任务编排与缓存引擎，结合 Docker Compose 提供本地开发依赖服务。整体构建体系围绕以下核心组件展开：

**包管理器与工作区**：根 `package.json` 声明 `packageManager: "pnpm@9.15.0"` 和 Node 引擎要求 `>=20`，通过 `pnpm-workspace.yaml` 将 `apps/*` 和 `packages/*` 纳入统一工作区，实现跨包依赖解析。

**任务编排与缓存**：Turbo (`turbo ^2.5.0`) 在根 `package.json` 中暴露 `dev`、`build`、`lint`、`db:*`、`clean` 等脚本，实际由 `turbo.json` 定义任务依赖图与缓存策略。`build` 任务依赖上游包的 `^build` 和 `^db:generate`，输入包含 `.env*`，输出为 `.next/**` 和 `dist/**`；`dev`、`db:generate`、`db:push`、`db:migrate`、`clean` 均禁用缓存以保证实时性。

**子包职责划分**：
- `apps/web`：Next.js 应用，使用 Turbopack 开发模式，Vitest 测试，ESLint 校验，依赖 `@agent-up/shared` 通过 `workspace:*` 引用。
- `packages/shared`：纯 TypeScript 共享库，`tsc` 编译，无运行时依赖。
- `packages/ui`：React UI 组件库，声明 React 19 为 peerDependency，同样通过 `tsc` 构建。
- `packages/db`：Prisma 数据库包，提供 `db:generate`、`db:push`、`db:migrate`、`db:studio` 脚本，依赖 `@prisma/client`。

**本地依赖服务**：`docker-compose.yml` 启动 PostgreSQL 16 (端口 5432) 和 MinIO S3 兼容存储 (端口 9000/9001)，均配置健康检查，数据持久化到命名卷。

**产物打包**：`scripts/export.sh` 提供独立部署包生成流程：在 `apps/web` 执行 `pnpm build`，复制 `.next`、`public`、`data` 及配置文件到 `dist/agent-up-web/`，生成最小化 `package.json`（仅含 next、react、zod），并附带 `start.sh` 自动安装依赖后启动 Next.js 服务于 3000 端口，最终打包为 `agent-up-web.tar.gz`。

**约束与约定**：所有包遵循统一的 `build`/`clean` 脚本命名；数据库相关操作集中在 `packages/db`；环境变量通过 `.env` 文件管理并被 Turbo 全局依赖捕获；Node 版本锁定在 20+，确保类型与运行时一致性。