# agent-up · Web 应用

Next.js 16 (App Router, Turbopack) 全栈应用，Agent 改进平台的主界面与 API 层。

完整项目说明见仓库根目录 [README.md](../../README.md)。

## 本地开发

```bash
pnpm dev          # 独立启动（http://localhost:3000），或在根目录 pnpm dev
pnpm test         # 214 个测试（单元 + API 集成），临时数据目录隔离
pnpm lint         # ESLint（当前 0 errors）
pnpm build        # 生产构建
```

MOCK 登录演示账号：`allengaller` / `123`。数据源为 `data/` 目录本地 JSON（mock），未接入真实数据库。

## 目录速览

| 目录 | 职责 |
|------|------|
| `app/(dashboard)/` | 工作台页面：agents / releases / maas / feedback / skills / wiki / settings / architecture |
| `app/api/` | 26 个 route 文件，Zod 全量校验 |
| `lib/services/` | 业务逻辑层（agent / release / feedback / skill / wiki / effectiveness / audit） |
| `lib/data/store.ts` | JSON 文件存储（可用 `_setDataDir` 注入临时目录，测试隔离） |
| `data/` | 种子数据（mock） |
