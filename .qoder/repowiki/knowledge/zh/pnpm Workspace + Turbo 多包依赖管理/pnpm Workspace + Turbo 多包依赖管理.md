---
kind: dependency_management
name: pnpm workspace + Turbo 多包依赖管理
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
    - turbo.json
    - .github/workflows/ci.yml
    - apps/web/package.json
    - packages/db/package.json
---

## 1. 使用的系统/方案

- **包管理器**：pnpm（根 `package.json` 通过 `packageManager: "pnpm@9.15.0"` 锁定版本，CI 也显式安装 `pnpm/action-setup@v4` with `version: 9.15.0`）。
- **工作区**：`pnpm-workspace.yaml` 声明 `apps/*` 与 `packages/*` 两个 glob 模式，将 Next.js 应用 (`apps/web`) 与共享库 (`packages/db`) 纳入同一 pnpm workspace。
- **构建编排**：Turbo v2 (`turbo: ^2.5.0`) 作为根脚本入口，统一调度 dev/build/lint/clean 等任务；`turbo.json` 中通过 `dependsOn: ["^build", "^db:generate"]` 建立跨包的依赖顺序（`^` 表示上游包先执行）。
- **锁文件**：根级 `pnpm-lock.yaml` 是依赖版本的唯一事实源；CI 使用 `pnpm install --frozen-lockfile` 强制锁文件严格匹配。
- **Node 版本**：根 `engines.node = ">=20"`，CI 固定为 Node 20。

## 2. 关键文件

| 文件 | 作用 |
|---|---|
| `package.json` | 根工作区入口，声明 `turbo`、`typescript` 等根级 devDependencies，并通过 `scripts` 转发到 `turbo run ...` |
| `pnpm-workspace.yaml` | 定义 workspace 成员 glob |
| `pnpm-lock.yaml` | pnpm 依赖解析的完整锁文件 |
| `turbo.json` | Turbo 任务图、缓存策略、全局依赖（`.env`） |
| `.github/workflows/ci.yml` | CI 中固定 pnpm 9.15.0 / Node 20，并执行 `--frozen-lockfile` |
| `apps/web/package.json` | Web 应用的运行时依赖（next、react、mermaid、zod）及开发依赖（eslint、vitest、tailwindcss） |
| `packages/db/package.json` | 共享数据库包 `@agent-up/db`，依赖 `@prisma/client` 与 `prisma` |

## 3. 架构与约定

- **Monorepo 结构**：`apps/` 下放可独立部署的应用（当前仅 `web`），`packages/` 下放内部库（当前仅 `db`）。新包需遵循该命名空间才能被 workspace 自动发现。
- **内部包引用**：`apps/web` 通过 `"@agent-up/db": "workspace:*"` 引用同仓库的 `packages/db`，由 pnpm workspace 在本地解析，不发布到 npm registry。
- **依赖范围划分**：`apps/web` 只声明运行时依赖（next、react、mermaid、zod），构建/测试工具（eslint、vitest、tailwindcss、@types/*）放在 `devDependencies`；`packages/db` 同理，Prisma 相关依赖同时出现在 `dependencies`（`@prisma/client` 运行时需要）和 `devDependencies`（`prisma` CLI 需要生成 client）。
- **Prisma 集成**：`packages/db` 暴露 `src/index.ts` 作为 `main` 与 `types` 入口，对外提供单例 PrismaClient；`turbo.json` 中 `build` 任务依赖 `^db:generate`，确保 `@agent-up/db` 的 Prisma Client 先生成再被 web 构建。
- **构建产物**：Turbo 输出目录为 `.next/**` 与 `dist/**`（`turbo.json` 的 `tasks.build.outputs`），`node_modules` 不被纳入缓存。

## 4. 约定与约束

- **pnpm 版本锁定**：根 `package.json` 的 `packageManager` 字段与 CI 的 `pnpm/action-setup` 均固定为 `9.15.0`，二者必须保持一致（CI 注释明确说明 `packageManager: pnpm@9.15.0`）。
- **锁文件不可漂移**：CI 以 `pnpm install --frozen-lockfile` 运行，任何未提交到 `pnpm-lock.yaml` 的变更都会导致安装失败——这是仓库对依赖版本一致性的硬性约束。
- **Node 引擎要求**：根 `engines.node = ">=20"`，CI 固定 Node 20，开发者环境需满足该最低版本。
- **Workspace 成员范围**：只有 `apps/*` 与 `packages/*` 下的包会被 pnpm workspace 识别；新增包若不在这些 glob 下不会被自动发现。
- **内部包协议**：同仓库包之间使用 `workspace:*` 协议引用（如 `@agent-up/db`），而非版本号，避免重复安装与版本分裂。
- **Prisma Client 生成时机**：由于 monorepo 根找不到 schema，CI 单独执行 `pnpm --filter @agent-up/db exec prisma generate`，并在 `turbo.json` 中将 `db:generate` 设为非缓存任务，保证每次构建都重新生成。
- **无私有注册表配置**：仓库未发现 `.npmrc`、`registry` 或 `GOPRIVATE` 等私有源配置，所有依赖来自公共 npm registry。