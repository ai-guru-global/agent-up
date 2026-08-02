---
kind: configuration_system
name: AgentUp 配置系统：环境变量 + JSON 文件存储的分层配置管理
category: configuration_system
scope:
    - '**'
source_files:
    - .env.example
    - turbo.json
    - apps/web/next.config.ts
    - apps/web/app/api/agents/[id]/config/[partition]/route.ts
    - apps/web/lib/services/agent-service.ts
    - packages/db/package.json
    - docker-compose.yml
---

## 1. 使用的系统与工具
- **环境变量**：通过 `.env.example` 定义运行时配置（数据库、NextAuth、S3/MinIO、Git 仓库路径等），由 Next.js 自动加载 `NEXT_*` 前缀变量。
- **Turbo 缓存依赖**：`turbo.json` 将 `.env*` 声明为 `globalDependencies` 和 `inputs`，确保环境变量变更触发重新构建。
- **Prisma ORM**：数据库连接通过 `DATABASE_URL` 环境变量注入，使用 Prisma CLI 进行 schema 生成、推送与迁移。
- **JSON 文件存储**：应用数据与 Agent 配置分区（prompt/knowledge/tools/routing）以 JSON 文件形式持久化在内存式 store 中，并通过 API 暴露读写。
- **Docker Compose**：本地开发环境通过 `docker-compose.yml` 启动 PostgreSQL 与 MinIO 服务，提供 S3 兼容对象存储。

## 2. 核心文件与位置
- `.env.example` — 环境变量模板，定义 DATABASE_URL、NEXTAUTH_*、S3_*、WIKI_GIT_BASE_PATH 等键。
- `turbo.json` — 构建任务编排，声明 `.env*` 为全局依赖与输入。
- `apps/web/next.config.ts` — Next.js 配置（当前为空对象，默认行为）。
- `apps/web/app/api/agents/[id]/config/[partition]/route.ts` — Agent 配置分区的 RESTful API 路由，支持 GET/PUT 操作。
- `apps/web/lib/services/agent-service.ts` — Agent 配置的核心业务逻辑，包含分区读取、更新、版本递增与变更审计记录。
- `packages/db/package.json` — Prisma 脚本与依赖声明。
- `docker-compose.yml` — 本地数据库与对象存储服务定义。

## 3. 架构与设计决策
- **分层配置模型**：每个 Agent 的配置被划分为四个分区（prompt、knowledge、tools、routing），通过统一的 `updateConfigPartition` 函数处理，每个分区独立维护 version 与 lastModifiedAt 字段。
- **变更追踪与审计**：每次配置更新都会调用 `recordConfigChange` 生成 diff 快照并写入 `config-changes` 集合，同时记录审计日志，实现完整的配置变更历史追溯。
- **Actor 上下文**：配置修改通过 `withActor(resolveActor(request.headers))` 包裹，从请求头解析操作者身份，确保审计可追溯。
- **Schema 校验**：使用 Zod 对配置分区进行类型校验，`PARTITION_SCHEMA` 映射不同分区的验证规则。
- **文件系统存储**：所有数据（包括 Agent 配置、设置、技能、Wiki 等）均以 JSON 文件形式存储在 `data/` 目录下，通过 `store` 模块统一读写。

## 4. 约定与约束
- **环境变量命名约定**：数据库连接使用 `DATABASE_URL`，NextAuth 使用 `NEXTAUTH_URL` 和 `NEXTAUTH_SECRET`，S3 兼容存储使用 `S3_ENDPOINT`、`S3_ACCESS_KEY`、`S3_SECRET_KEY`、`S3_BUCKET`，Git 仓库基础路径使用 `WIKI_GIT_BASE_PATH`。
- **配置分区枚举约束**：仅允许 prompt、knowledge、tools、routing 四个分区，其他值会被拒绝并返回 400 错误。
- **版本控制约定**：每次配置更新自动递增 `version` 字段，确保配置变更的可追踪性。
- **审计日志约定**：所有配置变更必须记录变更前后差异、操作者信息和变更说明，写入独立的 `config-changes` 集合。
- **构建缓存依赖**：任何 `.env*` 文件的变更都会触发 Turbo 重新构建，确保配置变更生效。
- **开发环境依赖**：本地开发需要同时运行 PostgreSQL（端口 5432）和 MinIO（端口 9000/9001）服务。
- **Node.js 版本要求**：项目要求 Node.js >= 20，通过 `package.json` 的 engines 字段强制约束。

该配置系统采用简单直接的 JSON 文件存储方案，结合环境变量管理外部依赖，通过严格的分区管理和变更审计机制保证配置的完整性和可追溯性。