---
kind: configuration_system
name: 配置系统 — 环境变量 + JSON 文件存储 + Zod 校验的 Agent 配置管理
category: configuration_system
scope:
    - '**'
source_files:
    - .env.example
    - turbo.json
    - apps/web/next.config.ts
    - apps/web/app/api/agents/[id]/config/[partition]/route.ts
    - apps/web/lib/services/agent-service.ts
    - apps/web/lib/schemas.ts
    - docker-compose.yml
---

## 1. 使用的系统与工具
- **环境变量**：通过 `.env.example` 定义数据库、NextAuth、S3/MinIO、Git 仓库路径等运行时参数，由 Next.js 自动加载。
- **构建与任务编排**：Turbo 将 `.env` 和 `.env*` 作为 `globalDependencies` 和 task inputs，确保环境变量变更触发重新构建。
- **运行时配置存储**：应用使用基于文件的 JSON 存储（`apps/web/data/*.json`），通过 `lib/data/store` 抽象读写，Agent 的配置分区（prompt/knowledge/tools/routing）以 JSON 字段持久化在 agent 记录中。
- **数据校验**：所有配置更新均通过 Zod schema 进行严格校验，集中在 `apps/web/lib/schemas.ts` 中定义。
- **容器依赖**：`docker-compose.yml` 提供 PostgreSQL 和 MinIO 服务，为运行时配置提供外部依赖。

## 2. 核心文件与位置
- **环境变量模板**：`.env.example` — 定义 DATABASE_URL、NEXTAUTH_SECRET、S3_*、WIKI_GIT_BASE_PATH 等键
- **构建配置**：`turbo.json` — 声明 .env 为全局依赖，.env* 为 build 输入
- **Next.js 配置**：`apps/web/next.config.ts` — 空配置，依赖环境变量注入
- **配置文件路由**：`apps/web/app/api/agents/[id]/config/[partition]/route.ts` — GET/PUT 配置分区的 API
- **配置服务层**：`apps/web/lib/services/agent-service.ts` — getAgentConfig/updatePromptConfig/updateKnowledgeConfig/updateToolsConfig/updateRoutingConfig/recordConfigChange
- **Zod 校验 Schema**：`apps/web/lib/schemas.ts` — 四个配置分区的 schema 及映射
- **数据存储**：`apps/web/data/` 下的 JSON 文件（agents/settings/releases/feedback/skills/wiki-vaults）
- **Docker 依赖**：`docker-compose.yml` — PostgreSQL + MinIO 服务配置

## 3. 架构与设计决策
- **分层设计**：API Route → Service Layer → Store（文件系统）三层分离，配置逻辑集中在 service 层
- **分区模型**：Agent 配置分为 prompt/knowledge/tools/routing 四个分区，每个分区有独立的 Zod schema
- **版本控制**：每次配置更新自动递增 version 字段并记录 lastModifiedAt
- **变更审计**：所有配置变更通过 recordConfigChange 记录 before/after diff 到 config-changes 集合
- **Actor 上下文**：通过 withActor(resolveActor(request.headers)) 获取操作者信息，写入审计日志
- **环境隔离**：NODE_ENV 用于区分测试/开发/生产行为，错误处理和 Prisma 单例模式根据环境调整

## 4. 约定与约束
- **环境变量命名**：遵循 Next.js 标准（NEXTAUTH_*）、AWS SDK 标准（S3_*）、自定义前缀（DATABASE_URL、WIKI_GIT_BASE_PATH）
- **配置分区枚举**：仅允许 prompt/knowledge/tools/routing 四种分区，其他值返回 400 错误
- **Schema 强制校验**：所有 PUT 请求必须通过对应分区的 Zod schema 验证，否则返回验证错误
- **审计追踪**：每次配置变更必须调用 recordConfigChange，包含 diff、changedBy、changeNote 等元数据
- **文件存储约定**：JSON 文件按功能域组织（agents/settings/releases/feedback/skills/wiki-vaults），ID 命名规范
- **构建缓存**：Turbo 将 .env* 文件变化纳入构建缓存失效条件，确保配置更新后重新构建
- **容器化依赖**：PostgreSQL 和 MinIO 通过 docker-compose 提供，端口固定（5432、9000、9001）