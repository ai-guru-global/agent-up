---
kind: dependency_management
name: pnpm Workspace + Turbo 多包依赖管理
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - turbo.json
    - apps/web/package.json
    - packages/shared/package.json
    - packages/ui/package.json
    - packages/db/package.json
    - skills-lock.json
---

该仓库采用 pnpm workspace 与 Turbo 构建的 monorepo 架构，统一管理 Next.js Web 应用、共享包（db/shared/ui）及文档的依赖。核心机制如下：

**包管理器与工作区**
- 根 `package.json` 声明 `packageManager: "pnpm@9.15.0"` 与 `engines.node: ">=20"`，锁定 Node 版本。
- `pnpm-workspace.yaml` 将 `apps/*` 与 `packages/*` 纳入同一工作区，实现依赖提升与去重。
- 根级 `package-lock.json` 与 `pnpm-lock.yaml` 同时存在，但实际由 pnpm 生成并维护锁文件。

**任务编排与缓存**
- `turbo.json` 定义全局任务（build/dev/lint/db:*），通过 `dependsOn` 与 `inputs/outputs` 控制执行顺序与缓存策略，例如 build 依赖 `^build` 与 `^db:generate`，确保依赖包先构建。
- 开发任务禁用缓存（`cache: false`）并标记为 persistent，保证热更新可用。

**包结构与依赖约定**
- 共享包均为私有（`private: true`），不发布到 npm，仅通过 workspace 引用：`apps/web` 使用 `@agent-up/shared: "workspace:*"` 引入本地包。
- `packages/ui` 通过 `peerDependencies` 声明 React 依赖，避免重复安装。
- `packages/db` 封装 Prisma 客户端与迁移脚本，对外暴露类型入口 `src/index.ts`。
- 所有包统一使用 TypeScript 编译，`build` 脚本均为 `tsc`。

**技能依赖管理**
- `skills-lock.json` 锁定 `.agents/skills/` 下的 AI 技能包来源（GitHub 仓库路径）、计算哈希，确保技能内容可重现。

**约束与规范**
- 所有包均声明 `main` 与 `types` 指向 TypeScript 源文件，便于 IDE 类型推导。
- 依赖版本在各自 `package.json` 中显式声明，未使用 `*` 通配符（除 workspace 引用外）。
- 数据库相关任务（db:generate/push/migrate/studio）集中在 db 包内，通过 Turbo 统一调度。