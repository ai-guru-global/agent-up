---
kind: dependency_management
name: pnpm + Turborepo 多包依赖管理
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - turbo.json
    - pnpm-lock.yaml
    - apps/web/package.json
    - packages/shared/package.json
    - packages/ui/package.json
    - packages/db/package.json
---

## 1. 使用的系统/工具

本项目采用 **pnpm**（锁定版本 `9.15.0`，通过根 `package.json` 的 `packageManager` 字段强制）作为包管理器，结合 **Turborepo**（`^2.5.0`）进行跨包任务编排。依赖声明分布在根级与每个 workspace 子包的 `package.json` 中，并通过 `pnpm-workspace.yaml` 将 `apps/*` 与 `packages/*` 纳入同一工作区。

- 包管理器：`pnpm@9.15.0`（由根 `package.json` 的 `packageManager` 字段约束）
- 构建/任务编排：`turbo ^2.5.0`，根脚本统一转发到各 workspace 子任务（`dev`、`build`、`lint`、`db:*`、`clean`）
- Node 引擎要求：`>=20`（根 `engines` 字段）
- 锁文件：同时存在 `pnpm-lock.yaml` 与 `package-lock.json`（后者来自历史 npm/yarn 使用痕迹，实际安装走 pnpm）

## 2. 关键文件

- `package.json`（根）：定义 workspace 脚本、全局 devDependencies（turbo、typescript）、`packageManager` 与 `engines`
- `pnpm-workspace.yaml`：声明两个 workspace 目录 `apps/*` 与 `packages/*`
- `apps/web/package.json`：Next.js 应用入口，声明运行时依赖（next 16.2.10、react 19.2.4、zod、mermaid）及开发依赖（eslint、vitest、tailwindcss v4、postcss）
- `packages/shared/package.json`：内部共享库 `@agent-up/shared`，仅暴露 TypeScript 源码入口（`main`/`types` 指向 `src/index.ts`），无运行时依赖
- `packages/ui/package.json`：UI 组件库 `@agent-up/ui`，以 `peerDependencies` 形式声明 react/react-dom ^19，避免重复打包
- `packages/db/package.json`：数据库层 `@agent-up/db`，依赖 `@prisma/client ^6.10.0`，并提供 `db:generate`、`db:push`、`db:migrate`、`db:studio` 等 Prisma 脚本
- `turbo.json`：Turborepo 任务配置（具体缓存/任务图在此文件中定义）
- `pnpm-lock.yaml`：pnpm 锁文件，锁定所有解析后的依赖树

## 3. 架构与约定

- **Monorepo 分层**：`apps/web` 为唯一前端应用；`packages/shared`、`packages/ui`、`packages/db` 为内部私有包，均标记 `private: true`，不发布到公共 registry。
- **内部包引用**：通过 pnpm workspace protocol 引用——`apps/web` 中以 `"@agent-up/shared": "workspace:*"` 引入共享库，实现零拷贝链接，无需发布即可跨包消费。
- **依赖版本策略**：
  - 框架依赖（next、react、react-dom）在应用与 UI 包中保持严格一致（均为 19.x / 16.2.10），避免 React 双实例问题。
  - 第三方库普遍使用 `^` 语义化版本（如 zod `^3.24.0`、mermaid `^11.16.0`），由 pnpm 锁文件精确固化。
  - 开发依赖集中在各自 workspace 的 `devDependencies`，根级仅保留 turbo 与 typescript。
- **TypeScript 编译**：各 package 通过独立 `tsc` 命令构建，`main`/`types` 直接指向 `.ts` 源文件（TS 项目直出模式），减少中间产物。
- **Prisma 集成**：数据库相关脚本集中放在 `packages/db`，通过根 `db:*` 脚本经 Turbo 分发执行。

## 4. 约定与约束

- **包管理器锁定**：根 `package.json` 的 `packageManager` 字段强制使用 pnpm 9.15.0，CI/本地环境需匹配该版本。
- **Node 版本要求**：`engines.node >= 20`，确保运行环境与 Next.js 16 / React 19 兼容。
- **Workspace 协议**：内部包必须通过 `workspace:*` 引用，禁止硬编码版本号引用同仓库包。
- **私有包发布限制**：所有 `packages/*` 均标记 `private: true`，当前仓库未配置任何 npm/pnpm registry 或 `.npmrc`，不存在私有 registry 或 `publishConfig` 配置。
- **依赖来源**：从 `pnpm-lock.yaml` 可见依赖来源于 `registry.npmmirror.com`（淘宝镜像），但仓库未显式配置 `.npmrc`，说明镜像可能通过全局 pnpm 配置注入。
- **清理约定**：每个 workspace 提供统一的 `clean` 脚本（删除 `dist`、`.turbo`、`node_modules`），根 `clean` 通过 Turbo 并行触发。
- **测试与 lint**：应用层使用 vitest 与 eslint，脚本通过 `turbo run` 统一调度，保证多包一致性。

### 约束来源
- `package.json` 中的 `packageManager`、`engines`、`private` 字段
- `pnpm-workspace.yaml` 的 workspace 声明
- 各包 `package.json` 中 `workspace:*` 引用方式
- 根 `scripts` 对 `turbo run` 的统一封装