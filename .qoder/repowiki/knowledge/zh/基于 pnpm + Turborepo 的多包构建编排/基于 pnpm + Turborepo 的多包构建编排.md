---
kind: build_system
name: 基于 pnpm + Turborepo 的多包构建编排
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - turbo.json
    - pnpm-workspace.yaml
    - apps/web/package.json
    - packages/db/package.json
    - packages/shared/package.json
    - packages/ui/package.json
    - docker-compose.yml
---

本仓库采用 pnpm workspace + Turborepo 作为统一的构建与任务编排系统，将 Next.js Web 应用与三个共享包（@agent-up/db、@agent-up/shared、@agent-up/ui）纳入同一工作区，通过声明式任务图实现增量缓存与并行执行。

### 1. 使用的系统与工具
- 包管理器：pnpm 9.15.0（通过 packageManager 字段锁定），使用 pnpm-workspace.yaml 声明 apps/* 与 packages/* 两个目录为工作区成员。
- 任务编排与缓存：Turborepo 2.x，在根 turbo.json 中定义全局任务及其依赖关系、输入/输出文件与缓存策略。
- 运行时约束：Node >= 20（engines.node）。
- 数据库与对象存储：通过 docker-compose.yml 提供 PostgreSQL 16 与 MinIO 本地开发环境，含健康检查与持久卷。

### 2. 关键文件与职责
- package.json（根）：暴露统一入口脚本 dev / build / lint / db:* / clean，全部转发到 turbo run <task>，屏蔽子包差异。
- turbo.json：核心编排配置。globalDependencies: [".env"]；build 任务 dependsOn: ["^build"]，inputs 包含 $TURBO_DEFAULT$ 与 .env*，outputs 收集 .next/** 与 dist/**；dev 禁用缓存并标记 persistent；db:* 与 clean 显式关闭缓存。
- pnpm-workspace.yaml：声明工作区范围。
- apps/web/package.json：Next.js 16 + React 19 应用，脚本包括 dev --turbopack、build、start、Prisma 命令以及 clean；以 workspace:* 引用共享包。
- packages/*/package.json：
  - @agent-up/db：导出 src/client.ts，提供 Prisma Client 单例封装，build 走 tsc，同时暴露 db:generate / db:push / db:migrate 供上层调用。
  - @agent-up/shared：纯 TypeScript 类型/常量库，main 与 types 指向 src/index.ts。
  - @agent-up/ui：React 19 UI 组件骨架，声明 peerDependencies 避免重复安装。
- docker-compose.yml：本地一键拉起 Postgres 与 MinIO，端口 5432 / 9000 / 9001，带 healthcheck。

### 3. 架构与约定
- 任务分层：根层只负责编排，具体构建逻辑下沉到各包的 package.json.scripts；Turborepo 通过 dependsOn: ["^build"] 自动形成 DAG，确保被依赖包先产出。
- 缓存策略：仅对无副作用的 build / lint 启用缓存；dev、db:*、clean 强制不缓存，避免状态污染。
- 产物路径约定：Next.js 应用产物位于 .next/，被 turbo.json 的 build.outputs 捕获；TS 包产物位于各自 dist/（由 tsc 默认输出），同样被 Turborepo 追踪。
- 依赖版本对齐：根 package.json 锁定 turbo 与 typescript 版本，子包通过 workspace:* 零拷贝引用共享包，减少重复安装。
- 环境变量注入：.env 作为全局依赖参与缓存失效，配合 next.config.ts 与 Prisma 连接串完成环境区分。

### 4. 开发者应遵循的规则
- 新增任务：优先在对应包的 package.json.scripts 中定义，再通过根 turbo.json 声明其缓存与依赖行为；不要绕过 Turborepo 直接 pnpm exec。
- 保持脚本一致性：所有工作区成员都应提供 build 与 clean 脚本，以便 turbo run build / clean 在全仓生效。
- 谨慎开启缓存：涉及文件系统写入或外部服务交互的任务（如 db:*、prisma migrate）必须设置 cache: false。
- 环境变量管理：修改 .env 后需重新运行受影响的 task，因为 .env 已加入 globalDependencies。
- 依赖升级：共享包（@agent-up/db、@agent-up/shared、@agent-up/ui）升级后，上层应用需更新 workspace:* 版本号并通过 turbo run build 验证缓存命中。
- 本地开发：先 docker compose up -d 启动 Postgres 与 MinIO，再执行 pnpm dev 即可并行启动 Next.js 与相关依赖。