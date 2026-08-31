---
kind: configuration_system
name: 基于环境变量与 Prisma 的运行时配置系统
category: configuration_system
scope:
    - '**'
source_files:
    - .env.example
    - apps/web/.env
    - apps/web/lib/services/llm-service.ts
    - packages/db/prisma/schema.prisma
    - packages/db/src/client.ts
    - turbo.json
    - docker-compose.yml
    - pnpm-workspace.yaml
---

## 1. 整体方案

本仓库采用 **纯环境变量 + 框架原生加载** 的配置方式，没有引入任何第三方配置库（如 dotenv、config、envalid 等）。

- 应用层：Next.js 通过 `apps/web/.env` 文件注入 `process.env.*`，由业务代码直接读取。
- 数据库层：Prisma 通过 `packages/db/prisma/schema.prisma` 中的 `url = env("DATABASE_URL")` 声明式读取连接串。
- 编排层：Turbo 将根级 `.env` 和 `*.env*` 纳入构建输入，保证缓存失效。
- 基础设施层：`docker-compose.yml` 以容器环境变量形式提供 Postgres 与 MinIO 的凭据。

## 2. 关键文件与位置

| 职责 | 文件 | 说明 |
|---|---|---|
| 环境模板 | `.env.example` | 集中列出所有必需/可选环境变量及默认值 |
| Web 应用运行配置 | `apps/web/.env` | Next.js 实际加载的环境变量（仅该目录下的 .env 会被读取） |
| LLM 网关配置 | `apps/web/lib/services/llm-service.ts` | `getLlmConfig()` 从 `MIMO_API_KEY / MIMO_BASE_URL / MIMO_MODEL` 读取并返回配置对象 |
| 数据库连接 | `packages/db/prisma/schema.prisma` | `datasource db { url = env("DATABASE_URL") }` |
| Prisma 客户端单例 | `packages/db/src/client.ts` | 按 `NODE_ENV` 调整日志级别，非生产环境全局复用实例 |
| 构建缓存依赖 | `turbo.json` | `globalDependencies: [".env"]`，任务 inputs 包含 `.env*` |
| 容器服务配置 | `docker-compose.yml` | 为 postgres/minio 设置 `POSTGRES_*`、`MINIO_ROOT_*` 等环境变量 |
| Monorepo 工作区 | `pnpm-workspace.yaml` | 定义 `apps/*`、`packages/*` 两个包范围 |

## 3. 架构与约定

### 3.1 环境变量命名空间

项目使用全大写前缀区分不同子系统：
- `DATABASE_URL` — PostgreSQL 连接串（Prisma 读取）
- `NEXTAUTH_URL` / `NEXTAUTH_SECRET` — NextAuth 运行时配置
- `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` — S3/MinIO 兼容存储
- `WIKI_GIT_BASE_PATH` — Wiki Vault 本地仓库路径
- `MIMO_API_KEY` / `MIMO_BASE_URL` / `MIMO_MODEL` — MiMo LLM 接入凭据

### 3.2 配置读取模式

- **业务代码直读**：`apps/web/lib/services/llm-service.ts` 中 `getLlmConfig()` 直接从 `process.env` 取值，并提供默认值（`DEFAULT_BASE_URL`、`DEFAULT_MODEL`）。
- **校验与降级**：`isLlmConfigured()` 检查 `MIMO_API_KEY` 是否存在，不存在时调用链抛出 `LlmNotConfiguredError`（HTTP 503），实现“未配置即不可用”的防御策略。
- **Prisma 声明式读取**：数据库连接字符串完全由 Prisma schema 中的 `env()` 函数解析，不经过 Node 层中间件。
- **Docker Compose 注入**：Postgres 与 MinIO 的凭据通过 `environment` 字段注入容器进程，与 `.env.example` 中的键名保持一致。

### 3.3 多包隔离

- Next.js 应用位于 `apps/web/`，其 `.env` 文件**仅在该目录下生效**（Next.js 官方行为，注释明确说明根目录 `.env` 不会被读取）。
- 根级 `.env.example` 作为文档性模板，不随构建参与；真正的运行时配置在 `apps/web/.env`。
- Turbo 将根级 `.env` 标记为 `globalDependencies`，并在各任务的 `inputs` 中包含 `.env*`，确保环境变量变更触发重新构建。

### 3.4 运行时开关

- `NODE_ENV` 被用于控制日志输出粒度：Prisma 客户端在 development 下启用 `query/error/warn` 日志，生产仅保留 `error`。
- 测试用例通过 `vitest` 在 `beforeEach`/`afterEach` 中动态设置/删除 `process.env.MIMO_*`，验证配置缺失时的错误路径。

## 4. 约定与约束

1. **新增外部服务必须先在 `.env.example` 中登记**：当前所有环境变量（数据库、NextAuth、S3、Wiki Git、MiMo LLM）均集中列于该文件，作为新成员的环境配置清单。
2. **敏感凭据不得提交到版本库**：`apps/web/.env` 含真实 API Key，应通过 `.gitignore` 排除（仓库已忽略 `.env` 文件）。
3. **LLM 集成必须通过 `getLlmConfig()` 读取**：该函数封装了 baseUrl 尾部斜杠规范化、model 默认值、API key 存在性校验，避免散落的 `process.env` 访问。
4. **数据库连接只允许通过 Prisma**：`packages/db/src/client.ts` 导出唯一 PrismaClient 实例，禁止业务代码自行 new 连接。
5. **容器环境与开发环境键名对齐**：`docker-compose.yml` 中的 `POSTGRES_USER/PASSWORD/DB` 与 `.env.example` 中的 `DATABASE_URL` 遵循同一套命名约定，便于本地 docker-compose 启动后直接复用 `.env`。
6. **构建缓存对 `.env*` 敏感**：`turbo.json` 显式声明 `.env*` 为 task input，修改环境变量后需重新 build 才能生效，避免缓存命中旧配置。
7. **Next.js 前端不暴露任意 process.env**：`next.config.ts` 为空对象，未使用 `env` 白名单或 `publicRuntimeConfig`，意味着只有 server-side code（API routes、lib）能访问环境变量，前端 bundle 不会混入密钥。

## 5. 已知局限

- 无类型化配置校验（未使用 zod/envschema 等），新增环境变量容易拼写错误。
- 无配置热重载：修改 `.env` 需重启 dev server 或重新构建。
- 无多环境配置切换（dev/staging/prod），仅靠 `NODE_ENV` 区分日志级别，未看到 `.env.development` / `.env.production` 等变体。
- 无配置中心或远程配置拉取逻辑，所有配置均为静态文件/容器环境变量。