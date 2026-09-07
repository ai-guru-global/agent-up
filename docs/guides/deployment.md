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
| `cd apps/web && pnpm test` | 251 个测试（单元 + API 集成） |
| `cd apps/web && pnpm test -- --coverage` | 带覆盖率（阈值 lines/functions/statements ≥80，branches ≥70） |

### 数据与基础设施

- **当前运行时存储**：`apps/web/data/` 本地 JSON 文件（mock 种子数据），由 `lib/data/store.ts` 读写
- **不需要** `docker compose up`：`docker-compose.yml`（PostgreSQL + MinIO）与 `packages/db` 的 Prisma schema 是持久化落地阶段的储备，业务代码尚未接入 Prisma Client

## 二、环境变量

> ⚠️ **Next.js 只加载 `apps/web/` 目录下的 `.env`**，根目录 `.env` 对应用运行时不生效。
> LLM 凭据必须配在 `apps/web/.env`（已被 web 级 `.gitignore` 的 `.env*` 覆盖，不会进 git）。

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `MIMO_API_KEY` | LLM 功能必填 | — | 小米 MiMo Token Plan 凭据（`tp-` 前缀）；缺失时 4 个 LLM 集成点返回 503 |
| `MIMO_BASE_URL` | 否 | `https://token-plan-cn.xiaomimimo.com/v1` | Token Plan 套餐专属 Base URL（以控制台展示为准） |
| `MIMO_MODEL` | 否 | `mimo-v2.5-pro` | 模型 ID |
| `DATABASE_URL` | 否 | — | PostgreSQL（暂未使用） |
| `NEXTAUTH_URL` / `NEXTAUTH_SECRET` | 否 | — | NextAuth 接入位（暂未使用） |
| `S3_*` | 否 | — | MinIO/S3（暂未使用） |
| `WIKI_GIT_BASE_PATH` | 否 | — | Wiki Vault 仓库路径（暂未使用） |

配置后**重启 dev server**；Next.js 启动日志出现 `Environments: .env` 即加载成功。

## 三、生产构建

```bash
pnpm build                     # 产物在 apps/web/.next
cd apps/web && npx next start  # 生产模式启动
```

注意：

- 生产环境同样需要 `apps/web/.env`（或注入等效环境变量）才能启用 LLM 功能
- 静态页面（architecture / maas / login 等）预渲染；API 与动态页按需渲染
- 当前无 CI：提交前请本地执行 `pnpm lint && cd apps/web && pnpm test && pnpm build`（路线图 P3 项）

## 四、客户现场演示前检查清单

| 检查项 | 命令 / 动作 |
|--------|------------|
| 依赖与构建 | `pnpm install && pnpm build` 通过 |
| 测试全绿 | `cd apps/web && pnpm test` → 251/251 |
| 服务启动 | `pnpm dev` 后 `curl http://localhost:3000` 返回 200 |
| LLM 凭据 | `/maas` 页 LIVE 区块显示模型与 Base URL；点「发起真实调用」有回复 |
| 演示动线 | ① `/maas` 连通性 → ② 反馈页「AI 归因」→ ③ `/agents/ecs-assistant` 试聊 → ④ `/releases` 查看变更 + AI 摘要 + AI 评测 |
| 网络 | 现场网络可访问 `token-plan-cn.xiaomimimo.com`（Token Plan 有效期内） |
| 诚实边界 | 侧边栏 MOCK 徽标、登录页 MOCK 提示在位（演示时主动说明 mock 范围） |

## 五、相关文档

- 完整端点说明：[API 接口说明](../api/api-reference.md)
- 出问题先查：[故障排查手册](./troubleshooting.md)
- LLM 接入背景：[MiMo 交付报告](../reports/2026-08-25-mimo-llm-integration-delivery.md)
