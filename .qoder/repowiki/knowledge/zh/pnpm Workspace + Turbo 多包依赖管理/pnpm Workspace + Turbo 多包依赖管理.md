---
kind: dependency_management
name: pnpm workspace + Turbo 多包依赖管理
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

## 1. 使用的系统/方法

- **包管理器**：pnpm（根 `package.json` 通过 `packageManager: "pnpm@9.15.0"` 锁定版本，并声明 Node `>=20` 引擎要求）。
- **工作区**：`pnpm-workspace.yaml` 将 `apps/*` 与 `packages/*` 注册为 workspace 包，实现跨包共享依赖解析。
- **任务编排**：Turbo (`turbo v2.5.0`) 作为顶层脚本入口，统一执行 `dev`、`build`、`lint`、`db:*`、`clean` 等任务，并通过 `dependsOn` 和 `inputs/outputs` 控制构建顺序与缓存。
- **技能依赖**：除 npm/pnpm 外，项目还使用 `skills-lock.json` 锁定 `.agents/skills/` 下的 Claude Skills（来源为 GitHub `Leonxlnx/taste-skill`），每个 skill 以 `computedHash` 固定内容。

## 2. 关键文件

| 文件 | 作用 |
|---|---|
| `package.json` | 根工作区定义，声明 pnpm/Turbo/TS 开发依赖及顶层脚本 |
| `pnpm-workspace.yaml` | 声明 workspace 成员 `apps/*`、`packages/*` |
| `turbo.json` | 定义 `build`/`dev`/`lint`/`db:*`/`clean` 任务及其依赖关系与缓存策略 |
| `apps/web/package.json` | Next.js 应用依赖（Next 16.2.10、React 19.2.4、Zod、Mermaid 等），并以 `workspace:*` 引用本地 `@agent-up/shared` |
| `packages/shared/package.json` | 共享 TS 库（`@agent-up/shared`，私有，仅导出 TypeScript 源码） |
| `packages/ui/package.json` | UI 组件库（`@agent-up/ui`，声明 `peerDependencies` 要求 React ^19） |
| `packages/db/package.json` | Prisma 数据层（`@agent-up/db`，依赖 `@prisma/client` 6.10.0，提供 `db:generate`/`db:push`/`db:migrate`/`db:studio` 脚本） |
| `pnpm-lock.yaml` | pnpm 锁文件（未展开） |
| `skills-lock.json` | Claude Skills 锁定清单 |

## 3. 架构与约定

- **Monorepo 结构**：应用位于 `apps/web`，共享代码拆分为 `packages/{shared,ui,db}` 三个独立包，均通过 `name` 字段发布为 `@agent-up/*` 命名空间。
- **内部包引用**：应用通过 pnpm workspace protocol `workspace:*` 引用本地包（如 `apps/web` 中的 `"@agent-up/shared": "workspace:*"`），无需发布到公共 registry。
- **包可见性**：所有 `packages/*` 的 `package.json` 都标记为 `"private": true`，表明它们是仅供本 monorepo 消费的内部模块，不对外发布。
- **TypeScript 共享**：`packages/shared` 与 `packages/ui` 将 `main` 与 `types` 同时指向 `./src/index.ts`，使类型在编译期直接复用源码，避免额外构建产物。
- **依赖版本对齐**：React 19.2.4 在 `apps/web`、`packages/ui` 中保持一致；`packages/ui` 通过 `peerDependencies` 强制消费者安装匹配的 React 版本。
- **构建/任务编排**：`turbo.json` 规定 `build` 依赖 `^build`（上游包先构建）与 `^db:generate`（Prisma 客户端生成优先），`dev` 禁用缓存且持久运行，`lint` 依赖 `^build`。
- **环境配置**：`turbo.json` 将 `.env` 加入 `globalDependencies`，确保环境变量变化触发重新构建。

## 4. 约定与约束

- **包管理器锁定**：根 `package.json` 的 `packageManager` 字段锁定 pnpm 版本，配合 `pnpm-lock.yaml` 保证全仓库一致的依赖树。
- **Node 版本约束**：`engines.node >= 20` 强制运行时环境。
- **Workspace 协议**：内部包之间一律使用 `workspace:*` 引用，禁止通过版本号引用同仓库包。
- **私有包**：`packages/*` 全部标记 `private: true`，不会被发布到 npm registry。
- **Peer Dependency 约束**：`@agent-up/ui` 通过 `peerDependencies` 要求 React ^19，由消费者保证版本一致。
- **Prisma 集成**：数据库相关命令集中在 `packages/db`，并通过 Turbo 的 `db:generate`/`db:push`/`db:migrate` 任务暴露给上层应用。
- **Skills 锁定**：`.agents/skills/` 下的 AI Skill 通过 `skills-lock.json` 以 `computedHash` 精确锁定，来源均为 GitHub `Leonxlnx/taste-skill` 的不同路径。
- **无 vendoring**：未发现 `vendor/` 目录或第三方源码内联，依赖全部通过 pnpm 从 registry 拉取并由 lockfile 锁定。
- **无私有 registry 配置**：仓库中未发现 `.npmrc`、`.pnpmrc`、`registry` 或 `GOPRIVATE` 等私有源配置，默认使用公共 npm registry。