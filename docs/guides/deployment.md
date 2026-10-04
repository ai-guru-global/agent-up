# 部署指南

> 维护日期：2026-08-26 · 适用形态：本地开发 / 客户现场演示 / 生产构建
> 项目为 pnpm + Turborepo monorepo，唯一应用为 `apps/web`（Next.js 16）。

## 一、本地开发

### 前置条件

- Node.js >= 20（`package.json#engines`）
- pnpm >= 9（`packageManager: pnpm@9.15.0`）

### 启动

```bash
pnpm install          # 根目录，安装全部 workspace 依赖
pnpm dev              # turbo 编排启动 apps/web（http://localhost:3000）
```

登录（MOCK）：`allengaller` / `123`，登录后即管理员角色。

### 常用命令

| 命令 | 作用 |
|------|------|
| `pnpm dev` | 开发服务器（Turbopack） |
| `pnpm build` | 全量生产构建 |
| `pnpm lint` | ESLint（全绿，0 problems） |
| `cd apps/web && pnpm test` | 334 个测试（单元 + API 集成；需先 `docker compose up -d postgres`） |
| `cd apps/web && pnpm test -- --coverage` | 带覆盖率（阈值 lines/functions/statements ≥80，branches ≥70） |

### 数据与基础设施

- **运行时存储**：PostgreSQL 16 + Prisma ORM（批0–批5 全量落地，JSON 存储层已删除）；演示种子由 `pnpm db:seed` 灌入（可重复执行，先清库再灌入）
- **数据库准备**：`docker compose up -d postgres` → `pnpm db:migrate` → `pnpm db:seed`；测试经 `_resetDb` 清库连真实 PG（per-worker 独立测试库互不干扰）

## 二、环境变量

> ⚠️ **Next.js 只加载 `apps/web/` 目录下的 `.env`**，根目录 `.env` 对应用运行时不生效。
> LLM 凭据必须配在 `apps/web/.env`（已被 web 级 `.gitignore` 的 `.env*` 覆盖，不会进 git）。

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `MIMO_API_KEY` | LLM 功能必填 | — | 小米 MiMo Token Plan 凭据（`tp-` 前缀）；缺失时 4 个 LLM 集成点返回 503 |
| `MIMO_BASE_URL` | 否 | `https://token-plan-cn.xiaomimimo.com/v1` | Token Plan 套餐专属 Base URL（以控制台展示为准） |
| `MIMO_MODEL` | 否 | `mimo-v2.5-pro` | 模型 ID |
| `DATABASE_URL` | dev/测试必填 | — | PostgreSQL 连接串（`packages/db/.env` 供迁移与种子，`apps/web/.env` 供运行时与测试） |
| `AUTH_SECRET` | 生产必填 | — | 会话令牌 HMAC-SHA256 签名密钥（`lib/auth-token.ts`）。未配置时登录仍返回成功但签不出令牌，所有写操作的审计署名落到 `anonymous`。生成：`openssl rand -hex 32` |
| `AUTH_SESSION_TTL_HOURS` | 否 | `24` | 会话有效期（小时）；非法值回落默认 |
| `AUTH_TRUST_ACTOR_HEADERS` | 否 | 非 production 采纳 / production 拒绝 | 是否采纳明文 `x-actor-*` 请求头作为身份。`1`=强制采纳（仅当调用方已通过可信网关鉴权），`0`=强制拒绝 |

> **已从 `.env.example` 移除的历史键**：`NEXTAUTH_URL` / `NEXTAUTH_SECRET`（从未接线，认证走自研签名令牌而非 NextAuth）、`S3_*` 与 `WIKI_GIT_BASE_PATH`（Wiki Vault 快照/Git 仓库预留，代码中零消费方）。需要时按实际接线重新加入，不要保留「声明了但没人读」的配置。

### 构建期与测试期开关（不走 `.env`）

| 变量 | 设置方 | 作用 |
|------|--------|------|
| `DEMO_EXPORT` | `pnpm build:demo` 命令行 | 置 `1` 时 `next.config.ts` 切到 `output:"export"` + `trailingSlash` + `pageExtensions:["tsx"]`，产出纯静态 `out/`。`pageExtensions` 只留 `tsx` 意味着**全部 `route.ts` 处理器被排除在静态产物之外**——这是 `demo/mock-server.ts` 必须存在的原因 |
| `NEXT_PUBLIC_DEMO_MODE` | `next.config.ts` 的 `env:{}` 注入 | 静态轨运行时标记，前端据此安装 `demo/install-fetch.ts` 的浏览器端 fetch 拦截 |
| `VITEST_POOL_ID` | `lib/__tests__/setup/worker-db-env.ts` | 把 vitest worker 序号映射到独立测试库 `agentup_test_wN`，保证并行测试互不污染 |

> Next.js `output:"export"` **禁止存在 `middleware.ts`**，这是请求级鉴权无法用中间件实现、改为在 `resolveActor` 内收口的根本原因。

配置后**重启 dev server**；Next.js 启动日志出现 `Environments: .env` 即加载成功。

## 三、生产构建

```bash
pnpm build                     # 产物在 apps/web/.next
cd apps/web && npx next start  # 生产模式启动
```

注意：

- 生产环境同样需要 `apps/web/.env`（或注入等效环境变量）才能启用 LLM 功能
- 静态页面（architecture / maas / login 等）预渲染；API 与动态页按需渲染
- CI 已就绪（`.github/workflows/ci.yml`：lint + test 连 PG 服务容器 + build）；本地提交前建议执行同样三件套 `pnpm lint && cd apps/web && pnpm test && pnpm build`

## 四、客户现场演示前检查清单

| 检查项 | 命令 / 动作 |
|--------|------------|
| 依赖与构建 | `pnpm install && pnpm build` 通过 |
| 测试全绿 | `cd apps/web && pnpm test` → 315/315（需 PG：`docker compose up -d postgres`） |
| 服务启动 | `pnpm dev` 后 `curl http://localhost:3000` 返回 200 |
| LLM 凭据 | `/maas` 页 LIVE 区块显示模型与 Base URL；点「发起真实调用」有回复 |
| 演示动线 | ① `/maas` 连通性 → ② 反馈页「AI 归因」→ ③ `/agents/ecs-assistant` 试聊 → ④ `/releases` 查看变更 + AI 摘要 + AI 评测 |
| 网络 | 现场网络可访问 `token-plan-cn.xiaomimimo.com`（Token Plan 有效期内） |
| 诚实边界 | 侧边栏 MOCK 徽标、登录页 MOCK 提示在位（演示时主动说明 mock 范围） |

## 五、相关文档

- 完整端点说明：[API 接口说明](../api/api-reference.md)
- 出问题先查：[故障排查手册](./troubleshooting.md)
- LLM 接入背景：[MiMo 交付报告](../reports/2026-08-25-mimo-llm-integration-delivery.md)
