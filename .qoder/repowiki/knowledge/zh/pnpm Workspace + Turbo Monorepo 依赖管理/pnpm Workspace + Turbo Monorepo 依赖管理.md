---
kind: dependency_management
name: pnpm Workspace + Turbo Monorepo 依赖管理
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
    - pnpm-lock.yaml
---

### 1. 使用的系统与工具
- **包管理器**: pnpm（版本锁定在 `pnpm@9.15.0`，通过根 `package.json` 的 `packageManager` 字段强制）
- **Monorepo 编排**: pnpm workspace + Turbo（`turbo@^2.5.0`）统一构建、缓存与任务编排
- **Node 引擎要求**: `>=20`（根 `engines` 字段约束）
- **锁文件**: 同时存在 `package-lock.json` 与 `pnpm-lock.yaml`，实际以 pnpm 为准

### 2. 关键文件与位置
- 根级配置: `package.json`、`pnpm-workspace.yaml`、`turbo.json`、`pnpm-lock.yaml`、`skills-lock.json`
- Web 应用: `apps/web/package.json`（Next.js 16.2.10、React 19.2.4、Zod、Mermaid 等）
- 共享包:
  - `packages/shared/package.json` → `@agent-up/shared`（纯 TS，无运行时依赖）
  - `packages/ui/package.json` → `@agent-up/ui`（声明 react/react-dom 为 peerDependencies）
  - `packages/db/package.json` → `@agent-up/db`（Prisma Client 6.10.0）

### 3. 架构与约定
- **Workspace 引用**: 包间依赖通过 `workspace:*` 协议引用（如 `"@agent-up/shared": "workspace:*"`），避免硬编码版本号，保证 monorepo 内版本一致。
- **包命名空间**: 所有内部包统一使用 `@agent-up/` 前缀（shared、ui、db），便于区分第三方依赖。
- **构建管线**: Turbo 定义全局任务依赖关系（如 `build` 依赖 `^build` 和 `^db:generate`），并启用增量缓存；`dev`/`lint`/`db:*` 等任务按包独立执行。
- **TypeScript 编译**: 各包通过 `tsc` 直接编译到源码目录（`main`/`types` 指向 `./src/index.ts`），未输出独立 dist 目录，依赖 pnpm 的 hoist 机制解析类型。
- **UI 包依赖策略**: `@agent-up/ui` 将 React 声明为 `peerDependencies`，由消费方提供版本，避免重复打包。

### 4. 约定与约束
- **包管理器锁定**: 根 `package.json` 指定 `packageManager: "pnpm@9.15.0"`，CI/本地安装时必须使用该版本。
- **Node 版本约束**: `engines.node >= 20`，不满足时安装会失败。
- **Workspace 协议**: 内部包必须使用 `workspace:*` 引用，禁止写死具体版本号（从现有引用可观察到该模式）。
- **私有包标记**: 所有 `@agent-up/*` 包均设置 `"private": true`，表明这些包仅用于本 monorepo，不发布到公共 registry。
- **依赖版本同步**: 跨包共享的依赖（如 react、typescript、prisma）在各包中保持相同主版本，但未通过 pnpm overrides 强制统一，需人工维护一致性。
- **双锁文件并存**: 仓库同时保留 `package-lock.json` 与 `pnpm-lock.yaml`，但脚本与 workspace 配置均基于 pnpm，`package-lock.json` 可能为历史遗留。