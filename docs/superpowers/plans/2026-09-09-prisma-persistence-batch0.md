# Prisma 持久化迁移 —— 批0（基建）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通 Prisma/PostgreSQL 基建：schema 对齐运行时、生成首个迁移、apps/web 测试可连真实 PG（`_resetDb()` 替代 `_setDataDir`）、CI 加 PG 服务容器。**不改动任何业务代码与测试行为**（260 个既有测试全部保持原样）。

**Architecture:** strangler 式迁移的批0 只铺路不动业务。schema 按「运行时是事实源」补齐漂移（Trace / EvalCase / Release.aiReview / Agent 反向关系）；测试通过 `@agent-up/db` 导出的 prisma 单例直连 PG，`_resetDb()` 用 `TRUNCATE ... CASCADE` 做测试隔离。服务层数据访问改写从批1 开始，另有计划。

**Tech Stack:** Prisma 6.10（`packages/db`，client 单例已存在于 `packages/db/src/client.ts`）、PostgreSQL 16（docker-compose 已就绪）、Vitest 3（apps/web）、GitHub Actions。

**规格来源:** `docs/superpowers/specs/2026-09-09-prisma-persistence-production-design.md`（批0 = 规格 §4 第 1 批）。

**与规格的偏差（可接受，记录在案）:** 规格 §6 说「每批次测试用 `_resetDb()` + 灌入对应种子数据」——批0 没有任何服务改写到 DB，没有种子可灌；种子灌入推迟到批1（首个服务改写批次）。批0 的 `_resetDb()` 仅做 truncate。

**前置条件:**
- Docker Desktop 可用；仓库根目录已 `pnpm install`（node_modules 存在）。
- 工作树干净（`git status` 无未提交业务改动；本计划各任务只 add 列出的文件）。
- `apps/web/.env` 已存在（gitignored，含 MIMO_API_KEY），批0 只需追加一行 `DATABASE_URL`。

---

## 任务总览

| Task | 产出 | 提交 |
| --- | --- | --- |
| 1 | 本地 PG 就绪 + `packages/db/.env` + 连通验证 | （无——纯本地环境） |
| 2 | schema 对齐 + 首个迁移 `add_trace_evalcase_ai_review` | `feat(db): ...` |
| 3 | apps/web 接 `@agent-up/db` + vitest 配置 | `build(web): ...` |
| 4 | `_resetDb()` 冒烟测试（TDD） | `test(web): ...` |
| 5 | CI 加 PostgreSQL 服务容器 + migrate deploy | `ci: ...` |
| 6 | `.env.example` 口径 + 全量验证 | `docs: ...` |

**批0 完成判定:** `cd apps/web && pnpm test` → 262 passed（260 既有 + 新增 2）；`pnpm lint` 全绿；迁移文件已提交；CI 配置更新（真实验证在下次 push）。

---

### Task 1: 本地 PostgreSQL 就绪 + Prisma 连通验证

**Files:**
- Create: `packages/db/.env`（gitignored——根 `.gitignore` 的 `.env` 规则匹配任意层级，无需改 ignore）

- [ ] **Step 1: 启动 PostgreSQL**

```bash
docker compose up -d postgres
```

Expected: `Container agent-up-postgres-1  Started`（首次会拉取镜像 + 创建 `postgres_data` 卷，稍慢）。

- [ ] **Step 2: 等待健康检查通过**

```bash
docker compose ps postgres
```

Expected: STATUS 列含 `(healthy)`（healthcheck `pg_isready -U agentup`，约 5-10 秒）。

- [ ] **Step 3: 创建 `packages/db/.env`**

`packages/db/.env` 完整内容（Prisma CLI 只读 CWD 的 .env，所以放在 packages/db 下）：

```
DATABASE_URL="postgresql://agentup:agentup@localhost:5432/agentup?schema=public"
```

- [ ] **Step 4: 验证 gitignore 生效**

```bash
git status --short packages/db/.env
```

Expected: 输出为空（被忽略）。

- [ ] **Step 5: 验证 Prisma 能连上 DB**

```bash
cd packages/db && pnpm exec prisma migrate status
```

Expected: `Datasource "db": PostgreSQL database "agentup", schema "public" at "localhost:5432"` 且最后提示 `No migration found in prisma/migrations`（库是全新卷）。
若报 drift / "migrations have not yet been applied"：说明本地卷里有旧表残留，执行 `docker compose down -v && docker compose up -d postgres` 重建（仅本地开发库，安全），再重跑本步。

- [ ] **Step 6: 回到仓库根目录**

```bash
cd ../..
```

---

### Task 2: Schema 对齐运行时 + 首个迁移

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create（由 prisma 生成）: `packages/db/prisma/migrations/<timestamp>_add_trace_evalcase_ai_review/migration.sql`

**对齐依据（运行时事实源）:**
- `apps/web/lib/services/trace-service.ts:21`（TraceRecord）：id/agentId/systemPrompt/history/message/reply/model/usage/latencyMs/createdAt/rating/ratedAt/note。
- `apps/web/lib/services/eval-case-service.ts:26`（EvalCase）：sourceTraceId/expectation/createdBy 在运行时是必填；assertions 可选；status 恒 `"ACTIVE"`。
- `apps/web/lib/services/ai-review-service.ts:242`：release JSON 上的 `aiReview` 字段（AiReviewResult 自由形状 → Json 列）。

- [ ] **Step 1: Agent 模型加反向关系**

`packages/db/prisma/schema.prisma`，old_string：

```prisma
  // 关联实体
  feedbacks     Feedback[]
  releases      Release[]
  versions      AgentVersion[]
  skillBindings AgentSkillBinding[]
  wikiVault     WikiVault?
  configChanges ConfigChange[]
```

new_string：

```prisma
  // 关联实体
  feedbacks     Feedback[]
  releases      Release[]
  versions      AgentVersion[]
  skillBindings AgentSkillBinding[]
  wikiVault     WikiVault?
  configChanges ConfigChange[]
  traces        Trace[]
  evalCases     EvalCase[]
```

- [ ] **Step 2: Release 模型加 aiReview**

同文件，old_string：

```prisma
  // 关联配置快照
  configSnapshot Json?
```

new_string：

```prisma
  // 关联配置快照
  configSnapshot Json?

  // AI 评测结果快照（2026-09 断言门禁，运行时为自由形状 AiReviewResult）
  aiReview Json?
```

- [ ] **Step 3: 文件末尾追加 Trace 与 EvalCase 模型**

同文件，old_string（AuditLog 模型结尾，全文件唯一）：

```prisma
  @@index([resource, resourceId])
  @@index([userId, createdAt])
  @@index([action, createdAt])
  @@index([createdAt])
}
```

new_string：

```prisma
  @@index([resource, resourceId])
  @@index([userId, createdAt])
  @@index([action, createdAt])
  @@index([createdAt])
}

// ============================================================
// 试聊 Trace 与评测用例（2026-09 运行时新增，schema 补齐漂移）
// ============================================================

model Trace {
  id           String    @id @default(cuid())
  agentId      String
  agent        Agent     @relation(fields: [agentId], references: [id])
  systemPrompt String
  history      Json
  message      String
  reply        String
  model        String
  usage        Json
  latencyMs    Int
  createdAt    DateTime  @default(now())
  rating       String?
  ratedAt      DateTime?
  note         String?

  @@index([agentId, createdAt])
}

model EvalCase {
  id             String   @id @default(cuid())
  agentId        String
  agent          Agent    @relation(fields: [agentId], references: [id])
  sourceTraceId  String
  title          String
  expectation    String
  assertions     Json?
  systemPrompt   String
  history        Json
  message        String
  referenceReply String
  status         String   @default("ACTIVE")
  createdAt      DateTime @default(now())
  createdBy      String

  @@index([agentId, createdAt])
}
```

说明：主键仍允许应用侧传 `generateId()` 显式赋值（规格 §3 约定），`@default(cuid())` 只在未传时兜底；`history`/`usage`/`assertions` 为 Json（运行时自由形状）；DateTime ↔ ISO 字符串的转换在批4 服务改写时于服务边界完成，本批只建表。

- [ ] **Step 4: 生成并应用首个迁移**

```bash
cd packages/db && pnpm exec prisma migrate dev --name add_trace_evalcase_ai_review
```

Expected: 输出含 `Your database is now in sync with your schema` 与：

```
migrations/
  └─ 2026xxxxxxxxxx_add_trace_evalcase_ai_review/
    └─ migration.sql
```

该命令同时重新生成 Prisma Client（`prisma.trace` / `prisma.evalCase` 可用）。迁移 SQL 由 prisma 生成，人工抽查应包含 `CREATE TABLE "Trace"`、`CREATE TABLE "EvalCase"`、`ALTER TABLE "Release" ADD COLUMN "aiReview" ...`。

- [ ] **Step 5: 确认迁移目录可入库（未被 ignore）**

```bash
ls prisma/migrations && git status --short ../packages/db/prisma
```

Expected: 迁移目录存在；git status 显示 `schema.prisma`（M）与 `prisma/migrations/`（??）待提交。根 `.gitignore` 只 ignore `apps/web/prisma/migrations/`，不影响 packages/db。

- [ ] **Step 6: 提交**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(db): schema 对齐运行时 —— 新增 Trace/EvalCase 模型与 Release.aiReview"
```

- [ ] **Step 7: 回到仓库根目录**

```bash
cd ../..
```

---

### Task 3: apps/web 接入 @agent-up/db

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/vitest.config.ts`
- Modify（锁文件由 pnpm 更新）: `pnpm-lock.yaml`

- [ ] **Step 1: 修改 `apps/web/package.json`**

dependencies 加 `@agent-up/db`，devDependencies 加 `dotenv`。改后完整文件：

```json
{
  "name": "web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "build:demo": "DEMO_EXPORT=1 next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rm -rf .next .turbo node_modules"
  },
  "dependencies": {
    "@agent-up/db": "workspace:*",
    "@agent-up/shared": "workspace:*",
    "mermaid": "^11.16.0",
    "next": "16.2.10",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitest/coverage-v8": "^3.2.7",
    "dotenv": "^16.4.5",
    "eslint": "^9",
    "eslint-config-next": "16.2.10",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: 安装依赖（建立 workspace 链接 + 更新锁文件）**

```bash
pnpm install
```

Expected: `+ @agent-up/db 0.1.0 <- packages/db` 类似输出；`pnpm-lock.yaml` 出现变更。

- [ ] **Step 3: 修改 `apps/web/vitest.config.ts`**

两处：`test` 块加 `server.deps.inline`（@agent-up/db 是 TS 源码包，vitest 必须内联转换）与 `poolOptions`（限制并发 worker 数——每个 worker 的 PrismaClient 独立建连接池，批1 起 22 个测试文件全部连 PG，不限制会耗尽 PG 默认 100 连接上限；批1 落地后可再评估）。改后完整文件：

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "lib/__tests__/**/*.test.ts",
      "app/api/__tests__/**/*.test.ts",
    ],
    server: {
      deps: {
        inline: ["@agent-up/db"],
      },
    },
    poolOptions: {
      threads: { maxThreads: 4 },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      include: [
        "lib/errors.ts",
        "lib/context.ts",
        "lib/versioning.ts",
        "lib/diff.ts",
        "lib/schemas.ts",
        "lib/utils.ts",
        "lib/data/store.ts",
        "lib/services/**/*.ts",
      ],
      exclude: ["lib/__tests__/**", "lib/services/audit-service.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
```

- [ ] **Step 4: 验证基线不变（此时尚无任何测试连 DB）**

```bash
cd apps/web && pnpm test
```

Expected: `260 passed (260)`，与批0 前完全一致。

- [ ] **Step 5: 提交**

```bash
git add apps/web/package.json apps/web/vitest.config.ts pnpm-lock.yaml
git commit -m "build(web): 接入 @agent-up/db 依赖与 vitest 内联/并发配置"
cd ../..
```

---

### Task 4: `_resetDb()` 测试辅助 + Prisma 冒烟测试（TDD）

**Files:**
- Create: `apps/web/lib/__tests__/test-db.test.ts`
- Create: `apps/web/lib/data/test-db.ts`

- [ ] **Step 1: 确保 `apps/web/.env` 含 DATABASE_URL（vitest 的 `dotenv/config` 按 CWD 加载 apps/web/.env）**

```bash
grep -q '^DATABASE_URL=' apps/web/.env || echo 'DATABASE_URL="postgresql://agentup:agentup@localhost:5432/agentup?schema=public"' >> apps/web/.env
```

Expected: 无输出；`grep '^DATABASE_URL=' apps/web/.env` 能命中一行。

- [ ] **Step 2: 写失败测试**

创建 `apps/web/lib/__tests__/test-db.test.ts`，完整内容：

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@agent-up/db";
import { _resetDb } from "@/lib/data/test-db";

describe("_resetDb", () => {
  beforeEach(async () => {
    await _resetDb();
  });

  it("截断后写入 ProductGroup → Agent → Trace 并可完整读回", async () => {
    const pg = await prisma.productGroup.create({
      data: { name: "pg-test", displayName: "冒烟测试产品组" },
    });
    const agent = await prisma.agent.create({
      data: { name: "trace-smoke-agent", productGroupId: pg.id, createdBy: "test" },
    });
    const trace = await prisma.trace.create({
      data: {
        agentId: agent.id,
        systemPrompt: "你是测试助手",
        history: [{ role: "user", content: "hi" }],
        message: "hi",
        reply: "hello",
        model: "mimo-v2.5-pro",
        usage: { promptTokens: 12, completionTokens: 34, totalTokens: 46 },
        latencyMs: 42,
      },
    });

    const found = await prisma.trace.findUnique({ where: { id: trace.id } });
    expect(found).not.toBeNull();
    expect(found?.agentId).toBe(agent.id);
    expect(found?.reply).toBe("hello");
  });

  it("重复调用 _resetDb 幂等且清空数据", async () => {
    await _resetDb();
    const traces = await prisma.trace.findMany();
    expect(traces).toHaveLength(0);
  });
});
```

刻意用 `prisma.trace.create` 而非经 PromptConfig 建 Agent——PromptConfig 必填字段与运行时四分区结构的映射属批3/批4 范畴，冒烟测试不应被它阻塞。

- [ ] **Step 3: 运行验证失败**

```bash
cd apps/web && pnpm exec vitest run lib/__tests__/test-db.test.ts
```

Expected: FAIL，报错为 `Cannot find module '@/lib/data/test-db'`（实现还不存在）。

- [ ] **Step 4: 实现 `_resetDb()`**

创建 `apps/web/lib/data/test-db.ts`，完整内容：

```ts
/**
 * 测试专用：清空数据库全部业务表（批0 基建，逐步替代 _setDataDir 的测试隔离手段）。
 * 仅限 vitest 测试环境使用，生产代码不得导入。
 */
import "dotenv/config";
import { prisma } from "@agent-up/db";

const RESERVED_TABLES = new Set(["_prisma_migrations"]);

export async function _resetDb(): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const tables = rows
    .map((r) => r.tablename)
    .filter((t) => !RESERVED_TABLES.has(t));
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}
```

表名来自 pg_tables（Prisma 生成名均为字母数字下划线，双引号包裹兜底），CASCADE 处理 FK 依赖（如 agent → product_group）。

- [ ] **Step 5: 运行验证通过**

```bash
pnpm exec vitest run lib/__tests__/test-db.test.ts
```

Expected: `2 passed (2)`。

- [ ] **Step 6: 全量回归**

```bash
pnpm test
```

Expected: `262 passed (262)`（260 既有 + 2 新增），lint 无需重跑但若有问题先修。

- [ ] **Step 7: 提交**

```bash
git add apps/web/lib/data/test-db.ts apps/web/lib/__tests__/test-db.test.ts
git commit -m "test(web): 新增 _resetDb 测试基建与 Prisma 冒烟测试"
cd ../..
```

---

### Task 5: CI 加 PostgreSQL 服务容器

**Files:**
- Modify: `.github/workflows/ci.yml`（整文件替换）

- [ ] **Step 1: 替换 `.github/workflows/ci.yml` 为以下完整内容**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  quality-gate:
    name: lint · test · build
    runs-on: ubuntu-latest
    timeout-minutes: 15

    env:
      DATABASE_URL: postgresql://agentup:agentup@localhost:5432/agentup?schema=public

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: agentup
          POSTGRES_PASSWORD: agentup
          POSTGRES_DB: agentup
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U agentup"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9.15.0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        # packageManager: pnpm@9.15.0，锁文件唯一事实源为 pnpm-lock.yaml
        run: pnpm install --frozen-lockfile

      - name: Apply Prisma migrations
        # 测试依赖真实 PostgreSQL（服务容器）；deploy 只应用已提交的迁移，不会产生新迁移
        run: pnpm --filter @agent-up/db exec prisma migrate deploy

      - name: Lint
        # turbo run lint：web 包 eslint 全绿（构建产物目录已忽略）
        run: pnpm lint

      - name: Test
        # 测试连服务容器里的真实 PG（vitest 的 dotenv/config 找不到 .env 时回落到
        # job 级 env 的 DATABASE_URL）；LLM 端点全 mock fetch，不发真实请求
        run: cd apps/web && pnpm test

      - name: Build
        # packages/db 的 build 内含 prisma generate，无需额外配置；
        # 未配置 MIMO_API_KEY 时 LLM 端点仅降级为 503，不影响构建
        run: pnpm build
```

（原文件「241 个单元」的过期计数注释随替换移除，改为不带具体数字的口径，避免每次加测试都要改注释。）

- [ ] **Step 2: 提交**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: 测试步骤接入 PostgreSQL 服务容器与迁移应用"
```

CI 行为无法本地验证，真实验证发生在下次 push；YAML 结构与既有写法保持一致以降低风险。

---

### Task 6: `.env.example` 口径更新 + 批0 收尾验证

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: 更新 `.env.example` 的 Database 段**

old_string：

```
# Database
DATABASE_URL="postgresql://agentup:agentup@localhost:5432/agentup?schema=public"
```

new_string：

```
# Database（批0 起测试/迁移必填；docker compose up -d postgres 启动本地库）
# 注意：Prisma CLI 按 CWD 读 .env，需把同一 DATABASE_URL 配到 packages/db/.env
DATABASE_URL="postgresql://agentup:agentup@localhost:5432/agentup?schema=public"
```

- [ ] **Step 2: 批0 完成判定全量验证**

```bash
cd apps/web && pnpm test && cd ../.. && pnpm lint
```

Expected: `262 passed (262)`；`Tasks: 2 successful, 2 total`（lint 全绿）。

- [ ] **Step 3: 提交**

```bash
git add .env.example
git commit -m "docs: .env.example 数据库口径更新（测试/迁移必填 + packages/db/.env 说明）"
```

- [ ] **Step 4: 汇报批0 完成，转入批1 计划编写**

批1（settings + audit 服务改写）在此批0 合入后另起 writing-plans 编写，不在本计划内。

---

## 风险与已规避项

| 风险 | 规避 |
| --- | --- |
| `@agent-up/db` 是 TS 源码包，vitest 无法直接加载 | Task 3 `server.deps.inline` |
| vitest 不自动加载 .env，测试连不上 DB | `test-db.ts` 顶部 `import "dotenv/config"` + Task 4 Step 1 的 apps/web/.env 追加 |
| 并发 worker 的 PrismaClient 连接池耗尽 PG 100 连接 | Task 3 `maxThreads: 4`（批1 再评估） |
| 首个 `migrate dev` 遇本地库残留旧表 drift | Task 1 Step 5 的 `docker compose down -v` 重建指引 |
| 迁移文件被误 ignore | 根 `.gitignore` 仅 ignore `apps/web/prisma/migrations/`；Task 2 Step 5 用 git status 复核 |
| CI 无法本地验证 | YAML 与既有结构保持一致；真实验证在下次 push，若红按报错修正（属本批收尾职责） |
| AuditLog.userId 指向 User 的运行时漂移（运行时无 users 集合，actor 是 header 传入） | 不属批0——批1 改 audit 服务时按规格 §3「运行时是事实源」裁决，本批不动 AuditLog |
