---
kind: configuration_system
name: AgentUp 配置体系：环境变量 + YAML 工具配置 + Prisma/Next.js 原生加载
category: configuration_system
scope:
    - '**'
source_files:
    - .env.example
    - apps/web/.env
    - packages/db/.env
    - apps/web/instrumentation.ts
    - apps/web/lib/auth-token.ts
    - apps/web/next.config.ts
    - packages/db/src/client.ts
    - turbo.json
    - code-up.yaml
    - skills-up.yaml
---

## 1. 采用的系统与方式

仓库没有引入统一的配置库（如 `dotenv`、`@configstore`、`conf`），而是采用「进程环境变量 + 各框架原生加载」的组合：
- **运行时密钥与连接串**：通过 Node.js 的 `process.env` 直接读取，由 Next.js 自动从 `apps/web/.env` 注入，Prisma CLI 从 `packages/db/.env` 读取。
- **AI 工具链配置**：`code-up.yaml`、`skills-up.yaml` 是纯 YAML 文件，由外部 Python 工具 `gate.py` 以「平铺点号键」（如 `output.dir`）形式解析，注释面向人，键值面向 Agent。
- **构建期开关**：`turbo.json`、`next.config.ts` 通过 `process.env.DEMO_EXPORT`、`NEXT_PUBLIC_DEMO_MODE` 等变量切换构建行为。

## 2. 关键文件

| 文件 | 作用 |
|---|---|
| `.env.example` | 根级模板，集中列出所有可配环境变量及语义说明（DATABASE_URL、AUTH_SECRET、MIMO_*） |
| `apps/web/.env` | Web 应用实际运行环境（含 SQLite DATABASE_URL、AUTH_SECRET） |
| `packages/db/.env` | Prisma CLI 使用的数据库连接串 |
| `apps/web/instrumentation.ts` | Next.js 启动钩子，生产环境校验 AUTH_SECRET 缺失即 `process.exit(1)` |
| `apps/web/lib/auth-token.ts` | 会话令牌实现，集中读取 AUTH_SECRET、AUTH_SESSION_TTL_HOURS、NODE_ENV |
| `apps/web/next.config.ts` | 根据 DEMO_EXPORT / NEXT_PUBLIC_DEMO_MODE 切换静态导出模式 |
| `packages/db/src/client.ts` | PrismaClient 单例，按 NODE_ENV 调整日志级别 |
| `turbo.json` | Turbo 任务定义，声明 `.env*` 为 build 输入、`.env` 为 globalDependencies |
| `code-up.yaml` | code-up 蒸馏工具的扁平 YAML 配置 |
| `skills-up.yaml` | skills-up 技能生成工具的扁平 YAML 配置 |

## 3. 架构与约定

### 3.1 环境变量分层
- **模板层**：`.env.example` 作为单一权威清单，描述每个变量的用途、默认值与生产约束。
- **应用层**：`apps/web/.env` 覆盖运行时密钥；`packages/db/.env` 仅暴露 DATABASE_URL，避免把业务密钥泄漏到 db 包。
- **测试层**：测试文件直接 `process.env.X = ...` / `delete process.env.X` 在运行时改写，不依赖 dotenv 加载（见 `lib/__tests__/llm-service.test.ts`、`app/api/__tests__/auth-login.test.ts`）。

### 3.2 安全敏感配置的启动期校验
`instrumentation.ts` 在 Next.js 进程注册阶段调用 `assertAuthConfigured()`（位于 `lib/auth-token.ts`），仅在 `NODE_ENV === 'production'` 且 `AUTH_SECRET` 为空时抛出错误并 `process.exit(1)`。注释明确解释为何不用顶层 throw：`next build` 会把 `NODE_ENV` 置为 production，顶层抛错会要求构建期就配好密钥，破坏构建产物跨环境平移。

### 3.3 非浏览器客户端身份头
`AUTH_TRUST_ACTOR_HEADERS` 控制是否采纳 `x-actor-*` 请求头作为身份来源（Chrome 扩展依赖此路径）。默认非 production 采纳、production 拒绝；只有调用方已通过可信网关鉴权时才应在生产置 `1`。

### 3.4 LLM 集成配置
MiMo (Xiaomi) LLM 通过 `MIMO_API_KEY`、`MIMO_BASE_URL`、`MIMO_MODEL` 三个环境变量接入，遵循 OpenAI 兼容协议。测试中统一在 `beforeEach` 设置后于 `afterEach` 清理。

### 3.5 构建期开关
`DEMO_EXPORT=1` 使 `next.config.ts` 启用 `output: 'export'` 与 `trailingSlash: true`，产出纯静态站点；同时注入 `NEXT_PUBLIC_DEMO_MODE=1` 给前端代码使用。

### 3.6 AI 工具 YAML 配置
`code-up.yaml` 与 `skills-up.yaml` 均要求**平铺点号键**（如 `output.dir`、`source.paths`），嵌套缩进写法会被 `gate.py` 拒绝并退出码 2。两个文件都包含 `version`、`gate.fail_on`、`plan.auto_approve` 等通用键，以及各自领域的 source/output/skill 分组键。

### 3.7 Prisma 客户端单例
`packages/db/src/client.ts` 使用 `globalThis.prisma` 守卫创建单例，开发环境开启 query/error/warn 日志，生产仅 error；非生产环境下挂载到 `globalForPrisma.prisma` 防止热重载重复实例化。

## 4. 约定与约束

- **环境变量命名空间**：认证类用 `AUTH_*`，LLM 类用 `MIMO_*`，Next.js 公共变量用 `NEXT_PUBLIC_*`，无统一 schema 校验，靠 `.env.example` 注释约定。
- **生产环境必须配置 AUTH_SECRET**：`instrumentation.ts` 强制校验，缺失则进程退出；否则审计署名静默落到 anonymous，问责链失效。
- **AUTH_SECRET 生成方式**：注释给出 `openssl rand -hex 32`。
- **会话 TTL 默认 24 小时**：`AUTH_SESSION_TTL_HOURS` 未配置或非法时回退 24。
- **YAML 配置必须是平铺点号键**：`code-up.yaml` 与 `skills-up.yaml` 头部注释明确要求，`gate.py` 对嵌套缩进直接 exit 2。
- **Turbo 缓存感知 .env***：`turbo.json` 将 `.env*` 加入 build task 的 inputs，并将 `.env` 列为 globalDependencies，确保环境变量变化触发重建。
- **Prisma CLI 的 CWD 限制**：`.env.example` 注释指出 Prisma CLI 按 CWD 读 `.env`，因此 DATABASE_URL 需同时出现在 `packages/db/.env`。
- **Chrome 扩展通过 x-actor-token 头传身份**：`readSessionToken` 优先取显式头，其次解析 Cookie，供非浏览器客户端使用。
- **测试隔离**：测试文件在 before/after 钩子中保存/恢复 `process.env`，避免污染其他测试用例。