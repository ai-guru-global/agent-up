---
kind: configuration_system
name: 配置系统：环境变量 + JSON 文件存储的混合方案
category: configuration_system
scope:
    - '**'
source_files:
    - .env.example
    - turbo.json
    - apps/web/next.config.ts
    - apps/web/lib/data/store.ts
    - packages/db/src/client.ts
    - apps/web/lib/services/agent-service.ts
    - docker-compose.yml
---

本仓库采用**环境变量（.env）+ Next.js 内置加载 + Prisma 客户端 + JSON 文件系统**的组合式配置管理方式，没有引入第三方配置库（如 dotenv、config、conf），而是依赖 Node.js/Next.js/Prisma 的原生能力。

### 1. 运行时环境变量
- **根级 `.env.example`** 定义了所有必需的环境变量模板，包括数据库连接 `DATABASE_URL`、NextAuth 的 `NEXTAUTH_URL` 与 `NEXTAUTH_SECRET`、S3 兼容存储（MinIO）的 `S3_ENDPOINT`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET`，以及 Wiki Git 仓库基础路径 `WIKI_GIT_BASE_PATH`。
- **Turbo 缓存依赖**：`turbo.json` 将 `.env` 和 `.env*` 声明为 `globalDependencies` 和 build inputs，确保环境变量变化时触发重新构建。
- **环境判断**：代码中通过 `process.env.NODE_ENV` 区分 development/test/production，控制 Prisma 日志级别、全局单例行为及审计日志写入策略。

### 2. 应用配置（Next.js）
- `apps/web/next.config.ts` 保持极简空对象，未使用 `env` 白名单或外部配置文件，所有运行时配置均通过环境变量注入。

### 3. 数据持久化配置（JSON 文件系统）
- **store 层**（`apps/web/lib/data/store.ts`）提供基于 `fs` 的 JSON 读写抽象，默认数据根目录为 `<cwd>/data`，支持测试时通过 `_setDataDir` 注入临时目录实现隔离。
- **Agent 配置分区**：每个 Agent 的 prompt/knowledge/tools/routing 四个分区以独立字段存储在 `agents/<id>.json` 中，每次更新递增 `version` 并记录 `lastModifiedAt`。
- **变更审计**：配置修改通过 `recordConfigChange` 写入 `config-changes/<id>.json`，同时生成审计日志，包含 before/after 快照与 diff 摘要。
- **种子数据**：`apps/web/data/` 下预置 agents、releases、versions、settings、skills、wiki-vaults 等 JSON 文件作为初始数据。

### 4. 数据库配置（Prisma）
- **Prisma Client**（`packages/db/src/client.ts`）直接读取 `DATABASE_URL` 环境变量，development 模式开启 query/error/warn 日志，非生产环境使用全局单例避免热重载重复实例化。
- **Docker Compose**（`docker-compose.yml`）提供 PostgreSQL 与 MinIO 服务，定义默认用户/密码/数据库名，供本地开发使用。

### 5. 约定与约束
- 所有敏感配置必须通过环境变量注入，禁止硬编码在源码中。
- 新增环境变量需在 `.env.example` 中同步添加注释说明。
- 数据文件损坏会抛出结构化 `AppError`（含状态码 500、类型 INTERNAL），而非裸 SyntaxError。
- Agent 配置分区更新必须通过 `updateXxxConfig` 函数，保证 version 自增与审计记录。
- Turbo 任务依赖 `.env*` 文件变化，确保构建缓存一致性。