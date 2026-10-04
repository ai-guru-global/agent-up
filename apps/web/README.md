# agent-up · Web 应用

Next.js 16 (App Router, Turbopack) 全栈应用，Agent 改进平台的主界面与 API 层。

完整项目说明见仓库根目录 [README.md](../../README.md)。

## 本地开发

```bash
pnpm dev          # 独立启动（http://localhost:3000），或在根目录 pnpm dev
pnpm test         # 371 个测试（单元 + API 集成），经 _resetDb 清库隔离；需本地 PostgreSQL（docker compose up -d postgres）并已执行 pnpm db:seed
pnpm lint         # ESLint（全绿，0 problems）
pnpm build        # 生产构建
pnpm build:demo   # 演示模式静态导出（产物 out/）
```

MOCK 登录演示账号：`allengaller` / `123`。登录成功下发 HMAC-SHA256 签名的会话令牌
（`Set-Cookie: agentup_session=…`），响应体含 `sessionIssued` 标记——为 `false` 说明
`AUTH_SECRET` 未配置，此时写操作的审计署名会落到 `anonymous`（生产环境缺配置则服务
启动即退出，见 `instrumentation.ts`）。侧边栏底部「登出」会清除会话 cookie。
数据源为本地 PostgreSQL（Prisma）；种子数据由 `pnpm db:seed` 写入（定义见 `packages/db/prisma/seed-data.mjs`）。

真实 LLM 功能（连通性测试 / AI 归因 / AI 变更摘要 / 试聊）需在 `apps/web/.env` 配置
`MIMO_API_KEY` / `MIMO_BASE_URL` / `MIMO_MODEL`（小米 MiMo Token Plan，见根目录 README）。

## 目录速览

| 目录 | 职责 |
|------|------|
| `app/(dashboard)/` | 工作台页面：agents / releases / maas / feedback / skills / wiki / settings / architecture |
| `app/api/` | 40 个 route 文件（含 5 个真实 LLM 端点），Zod 全量校验；完整说明见 `docs/api/api-reference.md` |
| `lib/` | 跨层基建：`errors.ts`（AppError 体系 → `handleApiError`）、`context.ts`（ALS actor 上下文）、`auth-token.ts`（HMAC 签名会话令牌）、`utils.ts`（响应/Zod 校验）、`schemas.ts`、`versioning.ts`（SemVer 派生）、`diff.ts`、`retrieval-bm25.ts`（BM25-lite 纯算法，全栈轨与静态轨共用） |
| `lib/services/` | 业务逻辑层（agent / release / feedback / skill / wiki / retrieval / effectiveness / trace / eval-case / ai-review / maas-usage / evidence-chain / version-lineage / llm / audit） |
| `lib/data/` | 测试基建：`test-db.ts`（`_resetDb` 清库隔离）与 `seed-db.ts`（测试种子辅助） |
| `demo/` | 演示模式 mock（`NEXT_PUBLIC_DEMO_MODE=1` 时浏览器端拦截同源 `/api/*`，内存态镜像 API 响应形状；初始数据来自 `@agent-up/db/prisma/seed-data.mjs` 共享种子数据集） |
