# agent-up · Web 应用

Next.js 16 (App Router, Turbopack) 全栈应用，Agent 改进平台的主界面与 API 层。

完整项目说明见仓库根目录 [README.md](../../README.md)。

## 本地开发

```bash
pnpm dev          # 独立启动（http://localhost:3000），或在根目录 pnpm dev
pnpm test         # 241 个测试（单元 + API 集成），临时数据目录隔离
pnpm lint         # ESLint（全绿，0 problems）
pnpm build        # 生产构建
pnpm build:demo   # 演示模式静态导出（产物 demo-deploy/dist/）
```

MOCK 登录演示账号：`allengaller` / `123`。数据源为 `data/` 目录本地 JSON（mock），未接入真实数据库。

真实 LLM 功能（连通性测试 / AI 归因 / AI 变更摘要 / 试聊）需在 `apps/web/.env` 配置
`MIMO_API_KEY` / `MIMO_BASE_URL` / `MIMO_MODEL`（小米 MiMo Token Plan，见根目录 README）。

## 目录速览

| 目录 | 职责 |
|------|------|
| `app/(dashboard)/` | 工作台页面：agents / releases / maas / feedback / skills / wiki / settings / architecture |
| `app/api/` | 30 个 route 文件（含 4 个真实 LLM 端点），Zod 全量校验；完整说明见 `docs/api/api-reference.md` |
| `lib/services/` | 业务逻辑层（agent / release / feedback / skill / wiki / retrieval / effectiveness / llm / audit） |
| `lib/data/store.ts` | JSON 文件存储（可用 `_setDataDir` 注入临时目录，测试隔离） |
| `demo/` | 演示模式 mock（`NEXT_PUBLIC_DEMO_MODE=1` 时浏览器端拦截同源 `/api/*`，内存态镜像 API 响应形状） |
| `data/` | 种子数据（mock） |
