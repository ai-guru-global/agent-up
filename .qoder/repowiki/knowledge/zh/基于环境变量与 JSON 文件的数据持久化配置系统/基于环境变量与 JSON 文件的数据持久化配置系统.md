---
kind: configuration_system
name: 基于环境变量与 JSON 文件的数据持久化配置系统
category: configuration_system
scope:
    - '**'
source_files:
    - .env.example
    - packages/db/prisma/schema.prisma
    - packages/db/src/client.ts
    - apps/web/lib/services/audit-service.ts
    - apps/web/lib/services/wiki-service.ts
    - docker-compose.yml
---

## 1. 使用的系统与方式

本项目采用**混合式配置方案**：
- **运行时环境配置**：通过 `.env` / `.env.example` 中的环境变量注入，由 Next.js 自动加载（无需额外库）。
- **数据库连接配置**：通过 Prisma 的 `env("DATABASE_URL")` 在 `packages/db/prisma/schema.prisma` 中声明。
- **业务数据/配置持久化**：应用层不使用数据库读写业务数据，而是将 Agent、Wiki Vault、权限、版本等全部以 JSON 文件形式存储在 `apps/web/data/` 目录下（如 `data/agents/*.json`、`data/wiki-vaults/*/pages/*.json`、`data/settings/*.json`），由 `@/lib/data/store` 模块统一读写。
- **Next.js 自身配置**：`apps/web/next.config.ts` 为空对象，无额外运行时配置项。

## 2. 关键文件与位置

| 作用 | 文件路径 |
|---|---|
| 环境变量模板 | `.env.example` |
| 数据库连接源 | `packages/db/prisma/schema.prisma`（`url = env("DATABASE_URL")`) |
| Prisma 客户端实例化 | `packages/db/src/client.ts` |
| 文件系统数据存取封装 | `apps/web/lib/data/store.ts`（被各 service 调用） |
| 审计日志写入目标 | `apps/web/data/settings/audit-logs.json` |
| Wiki Vault 数据目录 | `apps/web/data/wiki-vaults/<vaultId>/pages/*.json` |
| 种子数据（Agent/Skill/Release 等） | `apps/web/data/{agents,skills,releases,versions,feedback,settings,wiki-vaults}/*.json` |
| 本地基础设施配置 | `docker-compose.yml`（Postgres + MinIO 的环境变量） |

## 3. 架构与设计约定

### 3.1 环境变量分层
- `.env.example` 集中声明所有外部依赖所需的环境变量：`DATABASE_URL`、`NEXTAUTH_URL`、`NEXTAUTH_SECRET`、`S3_ENDPOINT`、`S3_ACCESS_KEY`、`S3_SECRET_KEY`、`S3_BUCKET`、`WIKI_GIT_BASE_PATH`。这些是部署时由运行环境提供，不提交到仓库。
- `docker-compose.yml` 为开发环境提供 Postgres 和 MinIO 的默认凭据（`agentup/agentup`、`minioadmin/minioadmin`），与 `.env.example` 中的默认值对应。

### 3.2 数据库配置
- 仅通过 Prisma schema 中的 `datasource db { url = env("DATABASE_URL") }` 读取连接串。
- `packages/db/src/client.ts` 根据 `NODE_ENV` 调整 Prisma 日志级别（development 输出 query/error/warn，production 仅 error），并在非 production 环境下将 PrismaClient 单例挂到 `globalThis` 以避免热重载重复连接。

### 3.3 业务配置即数据（JSON 文件）
- 所有“可配置的 Agent 行为”（prompt/knowledge/tools/routing 四分区）、版本快照、发布审批、技能绑定、Wiki 页面、权限角色等均存储为 `apps/web/data/` 下的 JSON 文件。
- 通过统一的 `store` 模块进行 CRUD，服务层（如 `wiki-service.ts`、`audit-service.ts`）直接操作该 store，而非直连数据库。
- 审计日志采用 append-only 模式写入 `data/settings/audit-logs.json`，失败不影响主业务流程（fire-and-forget，catch 后仅在非 test 环境 console.error）。

### 3.4 环境差异控制
- 使用 `process.env.NODE_ENV` 区分 development/test/production：Prisma 日志开关、审计错误是否打印、全局单例缓存策略等。
- 未使用 `NEXT_PUBLIC_` 前缀暴露任何前端环境变量；当前代码中未发现浏览器端读 `process.env` 的场景。

## 4. 约定与约束

- **环境变量必须来自 `.env.example` 或运行环境**：所有外部依赖（DB、S3/MinIO、Git、NextAuth）的配置均以环境变量形式注入，不在代码中硬编码。
- **数据库连接仅由 Prisma 管理**：应用层不直接拼接连接串，统一通过 `packages/db/src/client.ts` 导出的 `prisma` 实例访问。
- **业务数据一律走 JSON 文件**：API 路由和服务层通过 `store` 读写 `apps/web/data/` 下的 JSON，这是本项目的默认数据持久化方式；数据库模型（schema.prisma）目前仅作为类型/文档存在，README 也标注相关环境变量“暂未使用”。
- **审计日志不可阻塞主流程**：`recordAudit` 捕获异常并降级为 console.error，确保业务写操作成功不会被审计失败影响。
- **开发/测试环境隔离**：`NODE_ENV !== "test"` 时才输出审计错误；Prisma 单例在非 production 下才缓存到 `globalThis`。
- **配置文件命名规范**：每个实体一个 JSON 文件，按领域分目录（`agents/`、`wiki-vaults/<id>/pages/`、`settings/` 等），ID 作为文件名的一部分便于定位。