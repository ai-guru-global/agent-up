---
kind: dependency_management
name: 基于 pnpm workspace + Turbo 的 Monorepo 依赖管理
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
    - turbo.json
    - apps/web/package.json
    - packages/shared/package.json
    - packages/ui/package.json
    - packages/db/package.json
---

## 1. 使用的系统/方法

- **包管理器**：pnpm（锁定版本 `pnpm@9.15.0`，通过根 `package.json` 的 `packageManager` 字段强制），使用 `pnpm-lock.yaml`（lockfileVersion 9.0）作为唯一可信的依赖解析来源。
- **Monorepo 工作区**：`pnpm-workspace.yaml` 声明两个工作区目录 `apps/*` 和 `packages/*`，所有子包共享同一份 lockfile。
- **构建编排**：Turbo (`turbo@^2.5.0`) 作为顶层任务编排器，根 `package.json` 的脚本（`dev`、`build`、`lint`、`db:*`、`clean`）全部委托给 `turbo run ...`；`turbo.json` 定义任务缓存策略与依赖顺序（如 `build` 依赖 `^build` 与 `^db:generate`）。
- **Node 版本约束**：根 `engines.node = ">=20"`，配合 `.nvmrc`/`.tool-versions` 等未在此仓库出现，由 `packageManager` 与 `engines` 共同约束运行环境。

## 2. 关键文件

- `package.json`（根）：声明 workspace 工具链（turbo、typescript）、`packageManager`、`engines` 及顶层脚本。
- `pnpm-workspace.yaml`：定义 `apps/*`、`packages/*` 为工作区。
- `pnpm-lock.yaml`：全仓唯一的依赖锁定文件，记录每个 importer（根、`apps/web`、`packages/db`、`packages/shared`、`packages/ui`）下各包的精确解析版本。
- `turbo.json`：定义 `build`、`dev`、`lint`、`db:generate`、`db:push`、`db:migrate`、`clean` 等任务的缓存与依赖图。
- `apps/web/package.json`：Next.js Web 应用，依赖本地 workspace 包 `@agent-up/shared`（`workspace:*`）。
- `packages/shared/package.json`、`packages/ui/package.json`、`packages/db/package.json`：内部共享包，均标记 `private: true`，通过 `main`/`types` 指向 `./src/index.ts`，以 TypeScript 源码形式被引用。

## 3. 架构与约定

- **内部分包命名空间**：内部包统一使用 `@agent-up/*` 命名空间（`@agent-up/shared`、`@agent-up/ui`、`@agent-up/db`），并通过 `workspace:*` 在 `apps/web` 中引用，实现零拷贝链接安装。
- **私有包不发布**：三个 `packages/*` 均设 `private: true`，表明它们仅用于本 monorepo 内部消费，不会发布到 npm registry。
- **TypeScript 源码直引**：共享包将 `main` 与 `types` 都指向 `./src/index.ts`，使消费者直接编译源码而非预编译产物，配合 Turbo 的任务依赖保证类型正确性。
- **React 版本对齐**：`apps/web` 与 `packages/ui` 显式固定 `react`/`react-dom` 为 `19.2.4`，`packages/ui` 同时声明 `peerDependencies: { react: "^19", react-dom: "^19" }`，避免重复安装多份 React。
- **数据库包独立**：`packages/db` 单独管理 Prisma（`@prisma/client ^6.10.0`、`prisma ^6.10.0`），并通过 `turbo.json` 中的 `db:generate`、`db:push`、`db:migrate` 任务暴露给上层。
- **全局依赖**：`turbo.json` 的 `globalDependencies` 包含 `.env`，确保环境变量变更触发重新构建。

## 4. 约定与约束

- **必须使用 pnpm**：根 `package.json` 的 `packageManager: "pnpm@9.15.0"` 会强制使用指定 pnpm 版本安装依赖（由 pnpm 自身校验）。
- **依赖锁定不可绕过**：所有依赖解析结果写入 `pnpm-lock.yaml`，新增或升级依赖需通过 pnpm 命令生成更新后的 lockfile，禁止手动编辑。
- **工作区范围固定**：只有 `apps/*` 与 `packages/*` 下的目录会被识别为工作区包，其他目录不会被纳入依赖解析。
- **内部包保持私有**：`packages/*` 的 `private: true` 是发布层面的约束，防止误发布到公共 npm。
- **构建顺序由 Turbo 强制**：`build` 任务依赖 `^build`（上游包先构建）与 `^db:generate`（数据库 schema 先生成），开发者不能跳过这些前置步骤。
- **Node 版本下限**：`engines.node >= 20` 是运行环境约束，低于该版本的 Node 不应执行项目脚本。
- **无 vendoring / 私有 registry 配置**：仓库中未发现 `.npmrc`、`.pnp.*`、`vendor/` 目录或私有 registry 相关配置，依赖全部从默认 npm registry 解析。