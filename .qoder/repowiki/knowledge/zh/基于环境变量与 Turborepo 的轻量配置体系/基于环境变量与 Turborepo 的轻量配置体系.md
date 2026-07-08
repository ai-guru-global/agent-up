---
kind: configuration_system
name: 基于环境变量与 Turborepo 的轻量配置体系
category: configuration_system
scope:
    - '**'
source_files:
    - .env.example
    - turbo.json
    - apps/web/lib/prisma.ts
    - apps/web/next.config.ts
    - docker-compose.yml
---

本仓库未引入专用配置库，而是采用「Next.js 原生 .env + Prisma 环境变量 + Turborepo 全局依赖」的极简方案，将运行时配置集中在根级 .env 文件中，由 Next.js 和 Prisma 各自消费。

1. 系统/工具
- 环境变量：通过 Node.js process.env 注入，遵循 Next.js 客户端/服务端变量前缀约定（NEXTAUTH_*）。
- 构建期感知：Turborepo 在 turbo.json 中将 .env 加入 globalDependencies 与任务 inputs，确保环境变量变更触发缓存失效。
- 数据库连接：Prisma Client 通过 DATABASE_URL 读取连接串，日志级别按 NODE_ENV 切换。
- 容器化依赖：docker-compose.yml 提供 Postgres 与 MinIO 本地开发环境，其凭据与 .env.example 一一对应。

2. 关键文件
- .env.example：所有运行时密钥与端点的模板，覆盖数据库、NextAuth、S3/MinIO、Git 仓库路径。
- turbo.json：声明 .env 为全局依赖，并将 .env* 纳入 build/lint/db 任务的输入集合。
- apps/web/lib/prisma.ts：Prisma 单例封装，依据 NODE_ENV 调整查询日志策略。
- apps/web/next.config.ts：当前为空对象占位，尚未暴露任何 NEXT_PUBLIC_* 常量。
- docker-compose.yml：定义 Postgres 与 MinIO 服务的环境变量，作为本地运行时的隐式配置。

3. 架构与约定
- 单一事实源：.env 是唯一的运行时配置入口；各包不维护独立配置文件。
- 命名空间约定：
  - 数据库：DATABASE_URL（PostgreSQL DSN，含 schema=public）。
  - 认证：NEXTAUTH_URL、NEXTAUTH_SECRET（NextAuth v5 要求）。
  - 对象存储：S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET（兼容 MinIO）。
  - Git 仓库：WIKI_GIT_BASE_PATH（Wiki Vault 快照存放目录）。
- 环境区分：仅使用 NODE_ENV 区分 development/production，未引入 feature flag 或分环境多文件策略。
- 类型安全：共享类型包 packages/shared 中 Skill.config 字段为 Record<string, unknown>，表明 Agent/Skill 级别的动态配置以 JSON 形式持久化，而非通过环境变量注入。

4. 开发者应遵循的规则
- 新增环境变量时，同步更新 .env.example 并补充注释说明用途与默认值。
- 需要客户端可访问的配置，统一以 NEXT_PUBLIC_ 前缀暴露，并在 next.config.ts 中集中管理。
- 数据库相关变更通过 pnpm db:migrate / db:push 驱动，不要直接修改 DATABASE_URL 而不迁移。
- 本地联调优先使用 docker compose up，避免硬编码 localhost 端口或凭据到代码中。
- 生产部署时，由平台（Vercel/容器编排）注入真实 .env 值，禁止将 .env 提交至版本库。