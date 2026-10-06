---
kind: build_system
name: pnpm + Turbo 多包工作区构建与 CI 流水线
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - turbo.json
    - .github/workflows/ci.yml
    - scripts/export.sh
    - apps/web/package.json
    - packages/db/package.json
---

## 1. 使用的系统/工具

- **包管理器**: pnpm 9.15.0（根 `package.json` 通过 `packageManager` 字段锁定版本，CI 使用 `pnpm/action-setup@v4` 安装相同版本）。
- **Monorepo 编排**: Turbo 2.x（`turbo run dev/build/lint/db:*`），作为根脚本的唯一入口。
- **前端框架**: Next.js App Router（`apps/web`），开发走 Turbopack（`next dev --turbopack`）。
- **数据库层**: Prisma 6 + SQLite（`packages/db`），schema 位于 `prisma/schema.prisma`，迁移目录 `prisma/migrations/`。
- **测试**: Vitest 3（`apps/web/vitest.config.ts`），配合 `@vitest/coverage-v8` 生成覆盖率报告到 `apps/web/coverage/`。
- **CI**: GitHub Actions（`.github/workflows/ci.yml`），在 `ubuntu-latest` 上运行 lint → test → build。
- **打包分发**: 自定义 Bash 脚本 `scripts/export.sh` 将 Next.js 产物打包为独立 tarball。

## 2. 关键文件

| 文件 | 作用 |
|---|---|
| `package.json` | 根脚本入口，声明 `dev/build/lint/db:*` 等统一命令，锁定 Node ≥20、pnpm 9.15.0 |
| `pnpm-workspace.yaml` | 定义 workspace 成员：`apps/*`、`packages/*` |
| `turbo.json` | Turbo task 图：`build` 依赖 `^build` 和 `^db:generate`，输出 `.next/**` 与 `dist/**` |
| `.github/workflows/ci.yml` | CI 流水线：checkout → pnpm install → prisma generate → migrate deploy → lint → test → build |
| `scripts/export.sh` | 导出 Next.js 应用为可部署的 `agent-up-web.tar.gz` |
| `apps/web/package.json` | Web 应用脚本（dev/build/start/lint/test/clean），依赖 `@agent-up/db` via `workspace:*` |
| `packages/db/package.json` | DB 包脚本（build/db:generate/db:push/db:migrate/db:seed/wiki:corpus），`main` 指向 `src/index.ts` |

## 3. 架构与约定

### 3.1 Monorepo 结构

```
├── apps/web/          # Next.js 应用（前端 + API Routes）
├── packages/db/       # @agent-up/db 共享库（Prisma schema + client）
├── scripts/           # 运维脚本（export.sh）
└── turbo.json         # 跨包任务编排
```

- 所有子包通过 `pnpm-workspace.yaml` 自动发现，无需手动注册。
- `apps/web` 通过 `"@agent-up/db": "workspace:*"` 引用本地 db 包，类型与运行时均走 workspace link。

### 3.2 Turbo Task 依赖图

`turbo.json` 定义了全局任务拓扑：

- `build`：`dependsOn: ["^build", "^db:generate"]` —— 先构建上游包并生成 Prisma Client，再构建当前包；缓存输出 `.next/**` 与 `dist/**`。
- `dev`：`cache: false`、`persistent: true`，且依赖 `^db:generate`，确保开发时 Prisma Client 始终最新。
- `lint`：依赖 `^build`，保证 lint 在构建产物可用后执行。
- 所有 `db:*` 任务（generate/push/migrate/seed/clean）均关闭缓存，因为会写磁盘或数据库。

### 3.3 CI 流水线（GitHub Actions）

```yaml
# .github/workflows/ci.yml
on:
  push: [main]
  pull_request:
jobs:
  quality-gate:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      DATABASE_URL: "file:./ci.db"
steps:
  - checkout
  - setup pnpm 9.15.0
  - setup node 20 (cache: pnpm)
  - pnpm install --frozen-lockfile
  - pnpm --filter @agent-up/db exec prisma generate
  - pnpm --filter @agent-up/db exec prisma migrate deploy
  - pnpm lint
  - cd apps/web && pnpm test
  - pnpm build
```

- 使用固定 Node 20 与 pnpm 9.15.0，依赖锁文件 `pnpm-lock.yaml` 是唯一事实源（`--frozen-lockfile`）。
- 数据库使用 SQLite 单文件（`DATABASE_URL=file:./ci.db`），无需额外服务容器。
- Prisma Client 在 CI 中显式 `prisma generate`，注释说明 monorepo 根无法自动触发 postinstall。
- 测试阶段直接 `cd apps/web && pnpm test`，而非通过 turbo 调度。

### 3.4 应用打包（export.sh）

`scripts/export.sh` 将 Next.js 应用打包为独立可部署 tarball：

1. 进入 `apps/web` 执行 `pnpm build`。
2. 复制 `.next`、`public`、`data`、`next.config.ts` 到 `dist/agent-up-web/`。
3. 生成最小化 `package.json`（仅含 `next`、`react`、`react-dom`、`zod`）。
4. 生成 `start.sh`：若 `node_modules` 不存在则 `npm install --omit=dev`，然后 `npx next start -p 3000`。
5. 最终产出 `dist/agent-up-web.tar.gz`。

注意：该脚本硬编码 Next.js 16.2.10 / React 19.2.4，与 `apps/web/package.json` 中的版本一致。

## 4. 约定与约束

- **Node 版本**：根 `package.json` 的 `engines.node = ">=20"`，CI 固定 `node-version: 20`，开发者需满足最低版本要求。
- **pnpm 版本锁定**：根 `package.json` 的 `packageManager: "pnpm@9.15.0"` 与 CI 中 `pnpm/action-setup@v4 with version: 9.15.0` 保持一致，避免 lockfile 不一致。
- **依赖一致性**：CI 使用 `pnpm install --frozen-lockfile`，禁止隐式更新依赖。
- **Prisma Client 生成**：由于 monorepo 根找不到 schema，CI 与 `packages/db/build` 都显式调用 `prisma generate`；`turbo.json` 中 `build` 依赖 `^db:generate` 确保顺序。
- **数据库迁移**：CI 使用 `prisma migrate deploy`（只应用已提交的迁移，不产生新迁移），开发用 `prisma migrate dev`。
- **测试环境**：SQLite 单文件模式，LLM 端点全部 mock fetch，不发起真实网络请求。
- **构建产物**：Next.js 产物位于 `apps/web/.next`，被 `turbo.json` 的 `outputs` 缓存；`export.sh` 另起一套 `dist/` 目录用于发布。
- **Dockerfile**：仓库未包含 Dockerfile，部署形态由 `scripts/export.sh` 产出的 tarball 承载。
- **Makefile**：仓库未包含 Makefile，所有构建任务通过 pnpm/Turbo 脚本完成。