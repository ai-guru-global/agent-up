# 贡献指南

感谢你愿意为 agent-up 贡献！本指南覆盖环境搭建、常用命令、代码与提交规范。提 issue / PR 之前请先读一遍；参与本项目即表示你同意遵守[行为准则](CODE_OF_CONDUCT.md)。

## 前置要求

- **Node.js ≥ 20**（CI 在 20 / 22 两个 LTS 上验证）
- **pnpm 9.15+**（启用方式：`corepack enable`，仓库已通过 `packageManager` 字段锁定版本）
- 无需 Docker、无需任何数据库服务：存储是 SQLite 单文件

## 快速上手

```bash
git clone https://github.com/ai-guru-global/agent-up.git
cd agent-up
pnpm install

# 环境变量：参照 .env.example 配置两份（Next.js 只读应用目录下的 .env）
#   packages/db/.env   —— 供 Prisma CLI（迁移/种子）
#   apps/web/.env      —— 供运行时与测试
# 最小可用配置只需一行：DATABASE_URL="file:./dev.db"

pnpm db:generate                                    # 生成 Prisma Client
cd packages/db && npx prisma migrate deploy && cd .. # 应用已提交的基线迁移（建表）
pnpm db:seed                                        # 灌入演示种子（可重复执行）
pnpm dev                                            # 启动 http://localhost:3000
```

登录演示账号见 README「MOCK 声明与演示用途」。真实 LLM 功能（AI 归因、试聊 Playground 等）需另配 `MIMO_API_KEY`，缺失时相关端点返回 503，其余功能不受影响。

## 常用命令

| 命令 | 作用 |
|------|------|
| `pnpm dev` | 启动开发服务（Turbopack） |
| `pnpm lint` | ESLint（`apps/web`） |
| `pnpm typecheck` | TypeScript 全量类型检查（`tsc --noEmit`，web + db） |
| `pnpm test` | Vitest 全量测试（本地 SQLite 测试库自动创建） |
| `pnpm test:coverage` | 带覆盖率报告与阈值门禁（CI 同步强制） |
| `pnpm build` | 生产构建 |
| `pnpm db:generate` / `db:push` / `db:migrate` / `db:seed` | Prisma 工作流 |
| `pnpm clean` | 清理构建产物 |

## 测试纪律（硬约束）

- 覆盖率门禁 **lines/statements/functions ≥ 80、branches ≥ 70**。任何情况下都不允许为了通过而下调阈值——只能补测试；确实达不到时加 per-glob 阈值并说明理由。
- 每个测试文件经 `lib/data/test-db.ts` 的 `_resetDb`（按依赖序 `deleteMany`）清库后灌入自己的数据，不会弄脏开发库；测试 worker 各持独立 SQLite 文件（`lib/__tests__/setup/prepare-worker-dbs.ts`）。
- LLM 相关测试**全量 mock fetch**，不发真实请求；需要真实联调时在本地手工验证，不要把真实端点写进测试。

## 代码规范

- TypeScript strict；有意忽略的变量/参数用 `_` 前缀表达（ESLint 已按此配置）。
- 业务错误统一走 `apps/web/lib/errors.ts` 的 AppError 层级，API 返回结构化错误码；不要在 route 里裸 `try/catch` 后返回 500 文本。
- 所有 API 入参必须有 Zod schema（`apps/web/lib/schemas.ts`），route 层经 `validateBody` 消费。
- 数据库字段值域校验由 Zod 承担（SQLite 无 enum），不要在业务代码里散落魔法字符串比较。
- **MOCK 标注规范**：所有 mock 数据/页面必须显式标注（徽标 + 代码注释）；真实外部调用标 LIVE。诚实边界是本项目的核心纪律，详见 README「MOCK 声明与演示用途」。

## 文档规范

- 新增文档按 `YYYY-MM-DD-主题.md` 命名，放入 `docs/` 对应子目录（设计 → `docs/superpowers/specs`，交付记录 → `docs/reports`，使用指南 → `docs/guides`）。
- 改动 README 中对外承诺的行为时，同步更新对应文档。

## Commit 规范

Conventional Commits，中文摘要：

```
feat(db): wiki 正文入库——markdown 编译为两轨唯一语料
fix(api): audit-logs GET 兜住 AuthorizationError——权限拒绝返回 403 而非 500
docs(report): 批⑦回写——覆盖率扩围三组实测
chore(ci): 增加 typecheck 门禁与 Node 22 矩阵
```

类型取值 `feat | fix | docs | test | refactor | perf | chore | ci`，scope 常用 `web | db | api | retrieval | ci | report`。

## 提交 Pull Request

1. 从 `main` 拉分支：`feat/xxx`、`fix/xxx` 或 `chore/xxx`。
2. 确认自查清单全绿：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。
3. PR 描述按模板填写（变更说明 / 类型 / 自查清单 / 证据）；UI 变更附截图，行为变更附测试输出。
4. CI（lint · typecheck · test · build，Node 20 + 22 矩阵）必须全绿。

## 安全问题

不要用 issue 报告安全漏洞。请按 [SECURITY.md](SECURITY.md) 的私密渠道上报。
