---
kind: build_system
name: 构建与制品管理（pnpm + Turbo 多包 Monorepo）
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - turbo.json
    - pnpm-workspace.yaml
    - apps/web/package.json
    - packages/shared/package.json
    - packages/ui/package.json
    - packages/db/package.json
    - docker-compose.yml
    - scripts/export.sh
---

本项目采用基于 pnpm workspace 的 Monorepo 架构，通过 Turbo 统一编排 apps/web、packages/shared、packages/ui、packages/db 四个包的构建、开发与依赖关系。

**构建系统核心**
- 包管理器：pnpm@9.15.0，通过根目录 `package.json` 声明 `packageManager` 字段锁定版本，Node 引擎要求 `>=20`。
- 工作区配置：`pnpm-workspace.yaml` 将 `apps/*` 和 `packages/*` 纳入同一工作区，实现跨包依赖解析。
- 任务编排：Turbo v2.5.0 作为构建协调器，根 `package.json` 暴露 `dev/build/lint/db:generate/db:push/db:migrate/clean` 等脚本，全部委托给 `turbo run`。

**Turbo 任务定义与缓存策略**
- `build` 任务依赖所有上游包的 `^build` 以及 `^db:generate`，输出 `.next/**` 与 `dist/**`（排除 `.next/cache`），并缓存 `.env*` 作为输入。
- `dev` 任务禁用缓存、标记为 persistent，确保开发时实时响应。
- `lint` 依赖 `^build`，保证类型生成后再执行 lint。
- `db:*` 与 `clean` 任务均禁用缓存，避免状态污染。
- `globalDependencies` 包含 `.env`，环境变量变更会触发重新构建。

**各包构建职责**
- `apps/web`：Next.js 应用，使用 Turbopack 加速开发 (`next dev --turbopack`)，生产构建走 `next build`，测试使用 Vitest。
- `packages/shared`：纯 TypeScript 库，`build` 仅执行 `tsc`，无运行时依赖。
- `packages/ui`：React UI 组件库，声明 peerDependencies 约束 React 版本，构建同样仅 `tsc`。
- `packages/db`：Prisma 数据层，提供 `db:generate/db:push/db:migrate/db:studio` 脚本，schema 路径固定为 `prisma/schema.prisma`。

**本地依赖服务**
- `docker-compose.yml` 启动 PostgreSQL 16 (Alpine) 与 MinIO 对象存储服务，分别映射 5432、9000/9001 端口，内置 healthcheck 确保就绪。

**制品打包与分发**
- `scripts/export.sh` 是独立的打包脚本：在 `apps/web` 下执行 `pnpm build`，复制 `.next/public/data` 及配置文件到 `dist/agent-up-web/`，生成最小化 `package.json`（仅含 next/react/zod 运行依赖），附带 `start.sh` 自动安装依赖并以 3000 端口启动，最终打包为 `agent-up-web.tar.gz`。

**约定与约束**
- 所有包遵循统一的 `build`/`clean` 脚本命名规范，由 Turbo 统一调度。
- 数据库相关操作必须通过 `packages/db` 提供的 Prisma 脚本完成，schema 路径不可更改。
- 共享包与 UI 包仅编译 TypeScript，不产出额外产物，供其他包通过 `workspace:*` 引用。
- 环境变量通过 `.env` 文件注入，Turbo 将其纳入全局依赖以触发增量构建。