# Prisma 持久化 批1（settings + audit）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 settings（roles / permissions / product-groups）5 个路由与 audit-service 的数据访问从 JSON store 改写为 Prisma，public 契约不变，测试隔离升级为 per-worker 独立库。

**Architecture:** Strangler 改写：Prisma 成为审计事实源，JSON 写入保留为「镜像桥」直到批5 删除 store；settings 路由此前无 service 层、直接用 store，本批保持「路由直连数据层」的现有结构，只换数据访问实现。`_count` 反规范化字段改为 Prisma 关系真实计数。

**Tech Stack:** Prisma 6.19.3 / PostgreSQL 16 / Vitest 3.2.7（forks pool）/ Next.js 16 App Router / Zod

---

## 背景与范围

- 批0 已交付：Prisma 基建、`_resetDb()`（TRUNCATE 单库）、CI（postgres service + generate + migrate deploy）、test-db 冒烟测试。
- 批1 范围：`app/api/settings/**` 5 个路由 + `lib/services/audit-service.ts`。settings 此前**零测试覆盖**（无任何 API 测试），本批补齐。
- 批1 不动：feedback / skills / wiki / retrieval（批2）、agent-service（批3）、release 链与 trace/eval-case（批4）。

## 关键决策（事实核验后敲定）

| # | 决策 | 依据 |
|---|------|------|
| D1 | 测试隔离用 **per-worker 独立库**（`agentup_test_w1..w4`）：`globalSetup` 建库+跑迁移，`setupFiles` 按 `VITEST_POOL_ID` 重定向 `DATABASE_URL` | 批0 终审遗留裁决①（spec §7 忠实方案）；已核实 vitest 3.2.7 `worker.js:74` 注入 `VITEST_POOL_ID` |
| D2 | `AuditLog.userId` 从 `String` 外键改为 **可空普通列**，运行时落 `actor.id`（`"system"` 或请求头值） | 运行时审计流无 userId 概念、无 User 行；路由已有 `userId` 别名过滤，留列使其有真实语义 |
| D3 | `recordAudit` 双写：**Prisma 为主** + 同步 JSON 镜像（批5 删） | 13 个未迁移测试套件（agents/releases/wiki/skill/effectiveness/evidence-chain/rollback/feedback-skills-wiki…）通过 `store.readArray("settings","audit-logs.json")` 断言审计，批1 不能打破它们 |
| D4 | `listAudit` 改为 **async**（读 Prisma），签名增 `user?: string`（匹配 userName 或 userId）；新增 `flushAudit()` 测试辅助 | fire-and-forget 语义不变：调用方照旧忽略返回，测试用 `flushAudit` 收口 |
| D5 | `context.ts` 从模块级同步栈改为 **AsyncLocalStorage**；`resetActor()` 保留为空操作 | 现实现下 async 闭包（Prisma 改写的必然形态）会在首个 await 后丢失 actor → 审计署名错乱；ALS 是标准解，API 兼容 |
| D6 | `_count` 改为 **Prisma 关系真实计数**（roles.members=UserRole 数、permissions.roles=RolePermission 数、groups.agents/members=关系行数） | 运行时 JSON 里的 1/5/8 是无数据支撑的虚构静态值（无 users 数据文件）；批5 删 JSON 后无来源。UI 仅做展示，形状不变 |
| D7 | 唯一约束冲突显式处理：POST permission（resource+action）与 POST product-group（name）**预查重 → `ConflictError` 409** | JSON 时代无唯一性约束；Prisma 有 `@@unique`，不处理会变 500 |
| D8 | PG 世界测试同时 `useTempDataDir()`：JSON 镜像落 tmp，避免污染真实 `data/` | 双写桥的必然配套 |
| D9 | PG 世界测试的 `beforeEach` = `await _resetDb()` + `seedSettings()`；批1 自带最小种子夹具（`seed-db.ts`），全局 `db:seed` 仍是批5 | 复用批0 已验证的 TRUNCATE 机制；种子夹具只服务批1 测试 |

## 风险与协调项

| 风险 | 处置 |
|------|------|
| **`feedback-ingest.test.ts`（并行会话未跟踪 WIP）**在 Task 4 后必然失败：第 57 行 `listAudit({...})` 未 await 且断言 `toHaveLength(1)`；async 化 + per-worker 库无 truncate 会使它挂掉 | **不擅自改并行会话的文件**。执行到 Task 4 时向用户确认：由我顺手改这两处（await + beforeEach `_resetDb`），或留给对方会话改 |
| Task 2 起 `pnpm test` 硬依赖可达的 PostgreSQL（globalSetup 建库） | CI 已有 postgres service；本地已有 compose postgres + `packages/db/.env`。`.env.example` 批0 已注明 |
| 该文件是并行会话领域：maas-usage.test.ts 2 个既有失败 | 不动，终验时按「无新增失败」口径验收（批0 已确认与持久化无关） |
| `getActor()` 深度依赖：13+ 测试文件用 `resetActor()`、所有路由用 `withActor` | D5 保持三个函数签名不变，`resetActor` 保留为空操作，外部零改动 |
| 运行时新建实体 ID 从 `store.generateId()`（randomUUID）改为 Prisma cuid 默认 | 前端把 id 当不透明字符串；种子夹具用显式 id 对照运行时命名。已知、可接受 |

## 文件地图

- Create: `apps/web/lib/__tests__/setup/worker-count.ts`、`apps/web/lib/__tests__/setup/prepare-worker-dbs.ts`、`apps/web/lib/__tests__/setup/worker-db-env.ts`、`apps/web/lib/__tests__/context.test.ts`、`apps/web/lib/__tests__/worker-db.test.ts`、`apps/web/lib/__tests__/helpers/seed-db.ts`、`apps/web/app/api/__tests__/settings-roles.test.ts`、`apps/web/app/api/__tests__/settings-permissions-groups.test.ts`、`apps/web/app/api/__tests__/settings-audit-logs.test.ts`
- Modify: `apps/web/lib/context.ts`、`apps/web/vitest.config.ts`、`packages/db/prisma/schema.prisma`（AuditLog/User）、`apps/web/lib/services/audit-service.ts`、`apps/web/app/api/settings/roles/route.ts`、`apps/web/app/api/settings/roles/[id]/route.ts`、`apps/web/app/api/settings/permissions/route.ts`、`apps/web/app/api/settings/product-groups/route.ts`、`apps/web/app/api/settings/audit-logs/route.ts`
- Rewrite: `apps/web/lib/__tests__/audit-service.test.ts`
- Migration: `packages/db/prisma/migrations/*_audit_log_decouple_user/`

---

### Task 1: actor 上下文 AsyncLocalStorage 化

**Files:**
- Modify: `apps/web/lib/context.ts`
- Test: `apps/web/lib/__tests__/context.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/web/lib/__tests__/context.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { withActor, getActor, resolveActor } from "@/lib/context";

const alice = { id: "u-1", name: "张三", role: "product_member" };
const bob = { id: "u-2", name: "李四", role: "cre_viewer" };

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("getActor 缺省", () => {
  it("上下文外返回 system", () => {
    expect(getActor()).toEqual({ id: "system", name: "系统", role: "platform_admin" });
  });
});

describe("withActor 同步闭包（旧用法回归）", () => {
  it("闭包内生效，闭包外恢复", () => {
    const inside = withActor(alice, () => getActor().id);
    expect(inside).toBe("u-1");
    expect(getActor().id).toBe("system");
  });
});

describe("withActor 异步闭包（Prisma 改写的前提）", () => {
  it("await 之后 actor 仍生效", async () => {
    const name = await withActor(alice, async () => {
      await sleep(10);
      return getActor().name;
    });
    expect(name).toBe("张三");
  });

  it("并发请求互不串味", async () => {
    const [a, b] = await Promise.all([
      withActor(alice, async () => {
        await sleep(20);
        return getActor().id;
      }),
      withActor(bob, async () => {
        await sleep(5);
        return getActor().id;
      }),
    ]);
    expect(a).toBe("u-1");
    expect(b).toBe("u-2");
  });
});

describe("resolveActor（请求头解析回归）", () => {
  it("完整请求头", () => {
    const headers = new Headers({
      "x-actor-id": "u-9",
      "x-actor-name": "王五",
      "x-actor-role": "platform_admin",
    });
    expect(resolveActor(headers)).toEqual({ id: "u-9", name: "王五", role: "platform_admin" });
  });

  it("空请求头回退 system", () => {
    expect(resolveActor(new Headers())).toEqual({ id: "system", name: "系统", role: "platform_admin" });
  });

  it("缺某一项时该字段回退 system 值", () => {
    const headers = new Headers({ "x-actor-name": "王五" });
    expect(resolveActor(headers)).toEqual({ id: "system", name: "王五", role: "platform_admin" });
  });
});
```

- [ ] **Step 2: 跑测试确认「异步闭包」两组失败**

Run: `cd apps/web && pnpm vitest run lib/__tests__/context.test.ts`
Expected: 同步/请求头用例 PASS；「await 之后 actor 仍生效」「并发请求互不串味」FAIL（异步续体读到 system）。

- [ ] **Step 3: 改写 context.ts 为 AsyncLocalStorage**

整文件替换 `apps/web/lib/context.ts`：

```ts
/**
 * 请求级 actor 上下文。
 *
 * 当前阶段：从请求头 x-actor-id / x-actor-name / x-actor-role 解析，
 * 缺省回退到 "system"。这是一个**占位实现**——为将来接入 NextAuth 留好接口：
 * 届时只需把 resolveActor 改成读 session cookie / JWT，调用方零改动。
 *
 * 所有写操作（service 层）都应通过 getActor() 获取 actor，
 * 不再散落硬编码 "system"。
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface Actor {
  id: string;
  name: string;
  role: string;
}

const SYSTEM_ACTOR: Actor = {
  id: "system",
  name: "系统",
  role: "platform_admin",
};

// AsyncLocalStorage 让 actor 贯穿 await 之后的异步续体。
// 批1 起 route handler 闭包内是 async Prisma 调用，模块级同步栈会在
// 第一个 await 后丢上下文（审计署名错乱），故必须用 ALS。
const actorStorage = new AsyncLocalStorage<Actor>();

/** 从请求头解析 actor（缺省 system） */
export function resolveActor(headers: Headers): Actor {
  const id = headers.get("x-actor-id");
  const name = headers.get("x-actor-name");
  const role = headers.get("x-actor-role");
  if (!id && !name && !role) return SYSTEM_ACTOR;
  return {
    id: id?.trim() || SYSTEM_ACTOR.id,
    name: name?.trim() || SYSTEM_ACTOR.name,
    role: role?.trim() || SYSTEM_ACTOR.role,
  };
}

/** 在请求作用域内设置 actor，执行完（含异步续体）自动恢复。 */
export function withActor<T>(actor: Actor, fn: () => T): T {
  return actorStorage.run(actor, fn);
}

/** service 层取当前 actor */
export function getActor(): Actor {
  return actorStorage.getStore() ?? SYSTEM_ACTOR;
}

/**
 * 旧测试套件在 afterEach 调用。AsyncLocalStorage 上下文随作用域自动结束，
 * 无全局可重置状态，保留为安全空操作以兼容既有测试。
 */
export function resetActor(): void {}
```

- [ ] **Step 4: 跑测试确认全绿 + 全量回归（context 被 14 个测试文件引用）**

Run: `cd apps/web && pnpm vitest run lib/__tests__/context.test.ts`
Expected: 全 PASS（6+ 用例）。

Run: `cd apps/web && pnpm vitest run lib/__tests__/`
Expected: 除已知既有失败（maas-usage 2 个、feedback-ingest 集合错误）外全绿——即与改动前基线一致。

- [ ] **Step 5: 提交**

```bash
git add apps/web/lib/context.ts apps/web/lib/__tests__/context.test.ts
git commit -m "refactor(web): actor 上下文改为 AsyncLocalStorage，支持异步闭包（批1 前置）"
```

---

### Task 2: per-worker 独立测试库隔离（批0 裁决①落地）

**Files:**
- Create: `apps/web/lib/__tests__/setup/worker-count.ts`
- Create: `apps/web/lib/__tests__/setup/prepare-worker-dbs.ts`
- Create: `apps/web/lib/__tests__/setup/worker-db-env.ts`
- Create: `apps/web/lib/__tests__/worker-db.test.ts`
- Modify: `apps/web/vitest.config.ts`

- [ ] **Step 1: worker 数量常量**

创建 `apps/web/lib/__tests__/setup/worker-count.ts`：

```ts
/** vitest worker 数；必须与 vitest.config.ts 的 maxWorkers 一致 */
export const TEST_WORKER_DBS = 4;
```

- [ ] **Step 2: globalSetup —— 建 worker 库 + 跑迁移**

创建 `apps/web/lib/__tests__/setup/prepare-worker-dbs.ts`：

```ts
import { execFileSync } from "node:child_process";
import { config } from "dotenv";
import { PrismaClient } from "@agent-up/db";
import { TEST_WORKER_DBS } from "./worker-count";

/**
 * globalSetup（主进程一次性执行）：为每个 vitest worker 准备独立数据库。
 * 替代批0 的「单库 TRUNCATE 串行化」——多 worker 并发跑 PG 套件时互不干扰。
 */
export default async function prepareWorkerDbs(): Promise<void> {
  config(); // apps/web/.env
  if (!process.env.DATABASE_URL) config({ path: "../../packages/db/.env" });
  if (!process.env.DATABASE_URL) {
    throw new Error("测试需要 DATABASE_URL（见 .env.example 数据库一节）");
  }

  const base = new URL(process.env.DATABASE_URL);
  for (let i = 1; i <= TEST_WORKER_DBS; i++) {
    const dbName = `agentup_test_w${i}`;
    await ensureDatabase(base, dbName);
    applyMigrations(base, dbName);
  }
}

async function ensureDatabase(base: URL, dbName: string): Promise<void> {
  const admin = new URL(base);
  admin.pathname = "/postgres";
  const client = new PrismaClient({ datasourceUrl: admin.toString() });
  try {
    await client.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } catch (err) {
    // 42P04 = database already exists，复用即目标
    if (!(err instanceof Error && /42P04|already exists/.test(err.message))) throw err;
  } finally {
    await client.$disconnect();
  }
}

function applyMigrations(base: URL, dbName: string): void {
  const workerUrl = new URL(base);
  workerUrl.pathname = `/${dbName}`;
  execFileSync(
    "pnpm",
    ["--filter", "@agent-up/db", "exec", "prisma", "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: workerUrl.toString() },
      stdio: "pipe",
    },
  );
}
```

- [ ] **Step 3: setupFiles —— worker 进程内重定向 DATABASE_URL**

创建 `apps/web/lib/__tests__/setup/worker-db-env.ts`：

```ts
import { config } from "dotenv";

/**
 * setupFiles：每个测试文件执行前在 worker 进程内运行（先于任何测试模块导入，
 * 因此 @agent-up/db 的 PrismaClient 构造时读到的已是本 worker 专属 URL）。
 */
config(); // apps/web/.env
if (!process.env.DATABASE_URL) config({ path: "../../packages/db/.env" });
if (!process.env.DATABASE_URL) {
  throw new Error("测试需要 DATABASE_URL（见 .env.example 数据库一节）");
}

const poolId = process.env.VITEST_POOL_ID ?? "1";
const base = new URL(process.env.DATABASE_URL);
base.pathname = `/agentup_test_w${poolId}`;
process.env.DATABASE_URL = base.toString();
```

- [ ] **Step 4: vitest.config.ts 接线**

`apps/web/vitest.config.ts` 顶部加导入：

```ts
import { TEST_WORKER_DBS } from "./lib/__tests__/setup/worker-count";
```

`test` 配置内，把现有 `maxWorkers: 4,` 一行替换为：

```ts
    // worker 数 = 独立测试库数（见 lib/__tests__/setup/prepare-worker-dbs.ts）
    maxWorkers: TEST_WORKER_DBS,
    globalSetup: ["./lib/__tests__/setup/prepare-worker-dbs.ts"],
    setupFiles: ["./lib/__tests__/setup/worker-db-env.ts"],
```

- [ ] **Step 5: 写隔离冒烟测试**

创建 `apps/web/lib/__tests__/worker-db.test.ts`：

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@agent-up/db";
import { _resetDb } from "@/lib/data/test-db";

describe("worker 专属测试库", () => {
  beforeEach(_resetDb);

  it("DATABASE_URL 指向本 worker 专属库", () => {
    expect(process.env.DATABASE_URL).toMatch(/\/agentup_test_w\d+/);
  });

  it("建行可查、_resetDb 可清（隔离冒烟）", async () => {
    await prisma.productGroup.create({
      data: { id: "pg-iso", name: "iso-group", displayName: "隔离冒烟组" },
    });
    expect(await prisma.productGroup.findUnique({ where: { id: "pg-iso" } })).not.toBeNull();
    await _resetDb();
    expect(await prisma.productGroup.findUnique({ where: { id: "pg-iso" } })).toBeNull();
  });
});
```

- [ ] **Step 6: 验证（隔离 + 无回归）**

Run: `cd apps/web && pnpm vitest run lib/__tests__/worker-db.test.ts lib/__tests__/test-db.test.ts`
Expected: 全 PASS。首次运行可见 globalSetup 建 4 个库 + 各自 migrate deploy 的输出。

Run: `docker exec $(docker ps -qf name=postgres) psql -U agentup -c '\l' | grep agentup_test`
Expected: 列出 `agentup_test_w1` ~ `agentup_test_w4`。

Run: `cd apps/web && pnpm vitest run lib/__tests__/`
Expected: 除已知既有失败外全绿——setupFiles 对纯 JSON 套件无害（它们不导入 prisma）。

- [ ] **Step 7: 提交**

```bash
git add apps/web/lib/__tests__/setup/ apps/web/lib/__tests__/worker-db.test.ts apps/web/vitest.config.ts
git commit -m "test(web): per-worker 独立 PG 测试库（globalSetup 建库迁移 + VITEST_POOL_ID 重定向）"
```

---

### Task 3: AuditLog schema 修正 + 迁移（解耦 User 外键）

**Files:**
- Modify: `packages/db/prisma/schema.prisma`（AuditLog、User）
- Create: `packages/db/prisma/migrations/<ts>_audit_log_decouple_user/migration.sql`

- [ ] **Step 1: 改 schema**

`packages/db/prisma/schema.prisma` 中 `model AuditLog` 整体替换为：

```prisma
model AuditLog {
  id         String   @id @default(cuid())
  action     String
  resource   String
  resourceId String
  details    Json?
  // 运行时审计流没有 userId 概念；落 actor.id（"system" 或请求头值），
  // 仅作查询别名（GET /api/settings/audit-logs?userId= 兼容），不建外键
  userId     String?
  userName   String
  userRole   String
  ipAddress  String?
  userAgent  String?
  createdAt  DateTime @default(now())

  @@index([resource, resourceId])
  @@index([userId, createdAt])
  @@index([action, createdAt])
  @@index([createdAt])
}
```

`model User` 中删除 `auditLogs AuditLog[]` 一行（关系随外键一起移除）。

- [ ] **Step 2: 生成迁移**

Run: `pnpm --filter @agent-up/db exec prisma migrate dev --name audit_log_decouple_user`
Expected: 生成迁移，SQL 为两条：

```sql
-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "userId" DROP NOT NULL;
-- DropIndex / DropConstraint（名称以实际生成为准，形如）
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";
```

核对 `prisma/migrations/<ts>_audit_log_decouple_user/migration.sql` 只有上述语义的语句；若 diff 出现意外表改动，停下来查明（schema 是多批次共享的，不许顺手改）。

- [ ] **Step 3: 验证迁移干净应用**

Run: `pnpm --filter @agent-up/db exec prisma migrate status`
Expected: `Database schema is up to date!`

Run: `cd apps/web && pnpm vitest run lib/__tests__/worker-db.test.ts`
Expected: PASS（现有 PG 冒烟在新 schema 下正常）。

- [ ] **Step 4: 提交**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "fix(db): AuditLog.userId 解耦 User 外键——运行时审计流无 userId，落 actor.id 可空列"
```

---

### Task 4: audit-service 重写（Prisma 事实源 + JSON 镜像桥）

**Files:**
- Modify: `apps/web/lib/services/audit-service.ts`
- Rewrite: `apps/web/lib/__tests__/audit-service.test.ts`
- Create: `apps/web/lib/__tests__/helpers/seed-db.ts`

- [ ] **Step 1: 写失败测试（整文件替换 audit-service.test.ts）**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@agent-up/db";
import {
  recordAudit,
  listAudit,
  flushAudit,
  type AuditLogEntry,
} from "@/lib/services/audit-service";
import { withActor } from "@/lib/context";
import { store } from "@/lib/data/store";
import { _resetDb } from "@/lib/data/test-db";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";

beforeEach(_resetDb);

describe("recordAudit", () => {
  it("署名来自 withActor 上下文，actor.id 落 userId 列", async () => {
    let entry!: AuditLogEntry;
    withActor({ id: "u-42", name: "张三", role: "product_member" }, () => {
      entry = recordAudit("agent.update", "agent", "a1", { k: "v" });
    });
    expect(entry.userName).toBe("张三");
    expect(entry.userRole).toBe("product_member");
    await flushAudit();
    const row = await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
    expect(row).toMatchObject({
      action: "agent.update",
      resource: "agent",
      resourceId: "a1",
      userName: "张三",
      userRole: "product_member",
      userId: "u-42",
    });
  });

  it("无请求上下文时缺省系统署名", async () => {
    const entry = recordAudit("x.y", "z", "1");
    expect(entry.userName).toBe("系统");
    expect(entry.userRole).toBe("platform_admin");
    expect(entry.userId).toBe("system");
    await flushAudit();
    const row = await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
    expect(row.userId).toBe("system");
  });

  it("details 缺省时不写入 details 键，DB 列为 NULL", async () => {
    const entry = recordAudit("a", "b", "c");
    expect("details" in entry).toBe(false);
    await flushAudit();
    const row = await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
    expect(row.details).toBeNull();
  });

  it("fire-and-forget：调用方不 await，flushAudit 后落库", async () => {
    const entry = recordAudit("agent.create", "agent", "a2");
    await flushAudit();
    expect(await prisma.auditLog.count({ where: { id: entry.id } })).toBe(1);
  });

  it("桥接期同步镜像写 audit-logs.json（批5 移除）", async () => {
    useTempDataDir();
    try {
      const entry = recordAudit("mirror.test", "test", "m1");
      const logs = store.readArray<Record<string, unknown>>(
        "settings",
        "audit-logs.json"
      );
      expect(logs.some((l) => l.id === entry.id)).toBe(true);
    } finally {
      restoreDataDir();
    }
  });
});

describe("listAudit", () => {
  beforeEach(async () => {
    await prisma.auditLog.createMany({
      data: [
        { id: "l1", action: "agent.update", resource: "agent", resourceId: "a1", userName: "张三", userRole: "product_member", userId: "u-1", createdAt: new Date("2026-07-14T09:00:00.000Z") },
        { id: "l2", action: "role.create", resource: "role", resourceId: "r1", userName: "管理员", userRole: "platform_admin", createdAt: new Date("2026-07-15T10:00:00.000Z") },
        { id: "l3", action: "agent.update", resource: "agent", resourceId: "a2", userName: "张三", userRole: "product_member", userId: "u-2", createdAt: new Date("2026-07-16T11:00:00.000Z") },
      ],
    });
  });

  it("按 createdAt 倒序，createdAt 为 ISO 字符串", async () => {
    const list = await listAudit();
    expect(list.map((l) => l.id)).toEqual(["l3", "l2", "l1"]);
    expect(typeof list[0].createdAt).toBe("string");
  });

  it("action 过滤", async () => {
    const filtered = await listAudit({ action: "role.create" });
    expect(filtered.map((l) => l.id)).toEqual(["l2"]);
  });

  it("resource + resourceId 组合过滤", async () => {
    const filtered = await listAudit({ resource: "agent", resourceId: "a1" });
    expect(filtered.map((l) => l.id)).toEqual(["l1"]);
  });

  it("user 别名同时匹配 userName 与 userId", async () => {
    expect((await listAudit({ user: "张三" })).map((l) => l.id)).toEqual(["l3", "l1"]);
    expect((await listAudit({ user: "u-2" })).map((l) => l.id)).toEqual(["l3"]);
  });

  it("flushAudit 空集安全", async () => {
    await expect(flushAudit()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/web && pnpm vitest run lib/__tests__/audit-service.test.ts`
Expected: FAIL（listAudit 非 async、无 flushAudit 导出、记录进的是 JSON 不是 PG）。

- [ ] **Step 3: 创建种子夹具 helpers/seed-db.ts**

```ts
import { prisma } from "@agent-up/db";

/**
 * 批1 PG 测试的最小种子（全局 db:seed 是批5 的活）。
 * id 沿用运行时种子命名，便于与 data/settings/*.json 对照。
 */
export async function seedSettings(): Promise<void> {
  await prisma.permission.createMany({
    data: [
      { id: "perm-1", resource: "agent", action: "read", description: "查看 Agent" },
      { id: "perm-2", resource: "agent", action: "write", description: "编辑 Agent" },
      { id: "perm-3", resource: "agent", action: "publish", description: "发布 Agent" },
      { id: "perm-4", resource: "release", action: "approve", description: "审批发布" },
      { id: "perm-5", resource: "settings", action: "admin", description: "系统设置管理" },
    ],
  });
  await prisma.role.createMany({
    data: [
      { id: "role-admin", name: "platform_admin", displayName: "平台管理员", isSystem: true, description: "拥有所有权限" },
      { id: "role-product", name: "product_member", displayName: "产品组成员", isSystem: true, description: "可编辑本产品组的 Agent 配置" },
      { id: "role-cre", name: "cre_viewer", displayName: "CRE 查看者", isSystem: true, description: "可查看反馈和提交改进建议" },
      { id: "role-custom", name: "custom_role", displayName: "自定义角色", isSystem: false },
    ],
  });
  await prisma.rolePermission.createMany({
    data: [
      { roleId: "role-admin", permissionId: "perm-1" },
      { roleId: "role-admin", permissionId: "perm-2" },
      { roleId: "role-admin", permissionId: "perm-3" },
      { roleId: "role-admin", permissionId: "perm-4" },
      { roleId: "role-admin", permissionId: "perm-5" },
      { roleId: "role-product", permissionId: "perm-1" },
      { roleId: "role-product", permissionId: "perm-2" },
      { roleId: "role-product", permissionId: "perm-3" },
      { roleId: "role-cre", permissionId: "perm-1" },
    ],
  });
  await prisma.user.createMany({
    data: [
      { id: "user-chen", email: "pm-chen@example.com", name: "陈产品" },
      { id: "user-wang", email: "cre-wang@example.com", name: "王客服" },
    ],
  });
  await prisma.userRole.createMany({
    data: [
      { id: "ur-1", userId: "user-chen", roleId: "role-admin", assignedBy: "seed" },
      { id: "ur-2", userId: "user-wang", roleId: "role-cre", assignedBy: "seed" },
    ],
  });
  await prisma.productGroup.createMany({
    data: [
      { id: "ecs-group", name: "ecs-group", displayName: "ECS 产品组", description: "ECS 云服务器产品线" },
      { id: "rds-group", name: "rds-group", displayName: "RDS 产品组", description: "RDS 云数据库产品线" },
    ],
  });
  await prisma.productGroupMember.createMany({
    data: [
      { id: "pgm-1", productGroupId: "ecs-group", userId: "user-chen" },
      { id: "pgm-2", productGroupId: "ecs-group", userId: "user-wang" },
    ],
  });
  await prisma.agent.create({
    data: { id: "ecs-assistant", name: "ECS 助手", productGroupId: "ecs-group", createdBy: "user-chen" },
  });
}

/** audit-logs 路由测试用审计夹具（绕过 recordAudit 直插，可精确控制 userId/createdAt） */
export async function seedAuditLogs(): Promise<void> {
  await prisma.auditLog.createMany({
    data: [
      { id: "log-001", action: "agent.update", resource: "agent", resourceId: "ecs-assistant", userName: "pm-chen", userRole: "product_member", userId: "user-chen", createdAt: new Date("2026-07-14T09:00:00.000Z"), details: { partition: "persona", changeNote: "调整人设" } },
      { id: "log-002", action: "role.create", resource: "role", resourceId: "role-custom", userName: "admin-li", userRole: "platform_admin", createdAt: new Date("2026-07-15T10:00:00.000Z") },
      { id: "log-003", action: "feedback.update", resource: "feedback", resourceId: "fb-001", userName: "wang-cre", userRole: "cre_viewer", userId: "user-wang", createdAt: new Date("2026-07-16T11:00:00.000Z") },
      { id: "log-004", action: "agent.update", resource: "agent", resourceId: "rds-assistant", userName: "pm-chen", userRole: "product_member", userId: "user-chen", createdAt: new Date("2026-07-17T12:00:00.000Z") },
    ],
  });
}
```

- [ ] **Step 4: 重写 audit-service.ts**

整文件替换 `apps/web/lib/services/audit-service.ts`：

```ts
import { randomUUID } from "node:crypto";
import { prisma } from "@agent-up/db";
import { store } from "@/lib/data/store";
import { getActor } from "@/lib/context";

/**
 * 审计日志服务（append-only）。
 *
 * 批1 起 Prisma 是事实源；批2-4 迁移期内同步镜像写 audit-logs.json，
 * 供尚未迁移的测试套件断言（批5 删 store 时一并移除镜像）。
 *
 * 与 agent-service.recordConfigChange 的区别：
 * - recordConfigChange 写配置级 diff 明细（批3 迁移）
 * - recordAudit 写全局行为审计流
 */

export interface AuditLogEntry {
  id: string;
  action: string;
  resource: string;
  resourceId: string;
  userName: string;
  userRole: string;
  createdAt: string;
  /** 批1 新增可空列：actor.id（"system" 或请求头值），仅作查询别名 */
  userId?: string | null;
  details?: Record<string, unknown>;
}

const AUDIT_FILE = ["settings", "audit-logs.json"] as const;

const pendingWrites = new Set<Promise<unknown>>();

function track<T>(p: Promise<T>): Promise<T> {
  pendingWrites.add(p);
  void p.finally(() => pendingWrites.delete(p));
  return p;
}

/** 测试专用：等待所有 fire-and-forget 审计写入收口 */
export async function flushAudit(): Promise<void> {
  await Promise.allSettled([...pendingWrites]);
}

function appendJsonMirror(entry: AuditLogEntry): void {
  try {
    const all = store.readArray<AuditLogEntry>(...AUDIT_FILE);
    all.push(entry);
    store.writeArray(all, ...AUDIT_FILE);
  } catch {
    // 镜像失败可忽略：Prisma 才是事实源
  }
}

/**
 * 记录一条审计日志。fire-and-forget 语义：不阻塞调用方，失败只记日志。
 * 因为审计失败不应让业务写操作回滚。
 */
export function recordAudit(
  action: string,
  resource: string,
  resourceId: string,
  details?: Record<string, unknown>,
): AuditLogEntry {
  const actor = getActor();
  const entry: AuditLogEntry = {
    id: randomUUID(),
    action,
    resource,
    resourceId,
    userName: actor.name,
    userRole: actor.role,
    userId: actor.id,
    createdAt: new Date().toISOString(),
    ...(details ? { details } : {}),
  };

  track(
    prisma.auditLog
      .create({
        data: {
          id: entry.id,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          userName: entry.userName,
          userRole: entry.userRole,
          userId: entry.userId ?? null,
          createdAt: new Date(entry.createdAt),
          details: (entry.details ?? undefined) as never,
        },
      })
      .catch((err) => {
        // 审计失败不抛——业务已成功，不能因审计把请求变 500
        if (process.env.NODE_ENV !== "test") {
          console.error("[audit] recordAudit failed:", err);
        }
      })
  );

  appendJsonMirror(entry);
  return entry;
}

/** 供 GET /api/settings/audit-logs 与测试使用 */
export async function listAudit(filters?: {
  action?: string;
  resource?: string;
  resourceId?: string;
  /** 匹配 userName 或 userId（后者的历史别名语义保留） */
  user?: string;
}): Promise<AuditLogEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      ...(filters?.action ? { action: filters.action } : {}),
      ...(filters?.resource ? { resource: filters.resource } : {}),
      ...(filters?.resourceId ? { resourceId: filters.resourceId } : {}),
      ...(filters?.user
        ? { OR: [{ userName: filters.user }, { userId: filters.user }] }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    resource: row.resource,
    resourceId: row.resourceId,
    userName: row.userName,
    userRole: row.userRole,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
    ...(row.details
      ? { details: row.details as Record<string, unknown> }
      : {}),
  }));
}
```

> 注：`details: (entry.details ?? undefined) as never` 处理 `Record<string, unknown>` → Prisma Json 输入的类型收窄；执行时若 TS 报错，改为 `as Prisma.InputJsonObject`（`@agent-up/db` 已 `export * from "@prisma/client"`）。

- [ ] **Step 5: 跑测试确认全绿**

Run: `cd apps/web && pnpm vitest run lib/__tests__/audit-service.test.ts`
Expected: 全 PASS。

- [ ] **Step 6: 全量回归（13 个 JSON 审计断言套件必须原样通过）**

Run: `cd apps/web && pnpm vitest run`
Expected: 除已知既有失败（maas-usage 2 个、feedback-ingest 集合错误）外全绿。**若任何套件的审计断言失败，停下排查——双写桥的目标就是让它们零改动通过。**

- [ ] **Step 7: 提交（含与用户确认 feedback-ingest.test.ts 的处置）**

```bash
git add apps/web/lib/services/audit-service.ts apps/web/lib/__tests__/audit-service.test.ts apps/web/lib/__tests__/helpers/seed-db.ts
git commit -m "feat(web): audit-service 迁移 Prisma 事实源，JSON 保留双写镜像桥；listAudit 异步化"
```

---

### Task 5: settings/roles 路由重写 + API 测试

**Files:**
- Modify: `apps/web/app/api/settings/roles/route.ts`
- Modify: `apps/web/app/api/settings/roles/[id]/route.ts`
- Create: `apps/web/app/api/__tests__/settings-roles.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/web/app/api/__tests__/settings-roles.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as listRoles, POST as createRole } from "@/app/api/settings/roles/route";
import {
  PUT as updateRole,
  DELETE as deleteRole,
} from "@/app/api/settings/roles/[id]/route";
import { prisma } from "@agent-up/db";
import { flushAudit } from "@/lib/services/audit-service";
import { _resetDb } from "@/lib/data/test-db";
import { seedSettings } from "@/lib/__tests__/helpers/seed-db";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";

const ACTOR_HEADERS = {
  "Content-Type": "application/json",
  "x-actor-id": "u-test",
  "x-actor-name": "测试员",
  "x-actor-role": "platform_admin",
};

function makeRequest(method: string, body?: unknown, path = "/api/settings/roles") {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: ACTOR_HEADERS,
  });
}

beforeEach(async () => {
  await _resetDb();
  await seedSettings();
  useTempDataDir(); // JSON 镜像落 tmp（D8）
});
afterEach(restoreDataDir);

describe("GET /api/settings/roles", () => {
  it("返回含 permissions 与真实 _count.members 的角色列表", async () => {
    const res = await listRoles();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const admin = data.find((r: { id: string }) => r.id === "role-admin");
    expect(admin).toMatchObject({
      name: "platform_admin",
      displayName: "平台管理员",
      isSystem: true,
      description: "拥有所有权限",
      _count: { members: 1 },
    });
    expect(admin.permissions).toEqual([
      { permission: { id: "perm-1", resource: "agent", action: "read" } },
      { permission: { id: "perm-2", resource: "agent", action: "write" } },
      { permission: { id: "perm-3", resource: "agent", action: "publish" } },
      { permission: { id: "perm-4", resource: "release", action: "approve" } },
      { permission: { id: "perm-5", resource: "settings", action: "admin" } },
    ]);
  });
});

describe("POST /api/settings/roles", () => {
  it("创建角色：201 + 缺省形状 + 审计", async () => {
    const res = await createRole(
      makeRequest("POST", { name: "ops", displayName: "运维角色", description: "运维专用" })
    );
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({
      name: "ops",
      displayName: "运维角色",
      description: "运维专用",
      isSystem: false,
      _count: { members: 0 },
      permissions: [],
    });
    await flushAudit();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "role.create" } });
    expect(audit).toMatchObject({ resource: "role", userName: "测试员" });
  });

  it("description 缺省落 null", async () => {
    const res = await createRole(makeRequest("POST", { name: "x", displayName: "X" }));
    const { data } = await res.json();
    expect(data.description).toBeNull();
  });

  it("校验失败 422", async () => {
    const res = await createRole(makeRequest("POST", { name: "" }));
    expect(res.status).toBe(422);
  });
});

describe("PUT /api/settings/roles/[id]", () => {
  it("更新 displayName 与 description", async () => {
    const res = await updateRole(
      makeRequest("PUT", { displayName: "新名", description: null }, "/api/settings/roles/role-custom")
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toMatchObject({ id: "role-custom", displayName: "新名", description: null });
  });

  it("角色不存在 404", async () => {
    const res = await updateRole(
      makeRequest("PUT", { displayName: "x" }, "/api/settings/roles/role-missing")
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/settings/roles/[id]", () => {
  it("系统角色 403 且未被删除", async () => {
    const res = await deleteRole(
      makeRequest("DELETE", undefined, "/api/settings/roles/role-admin")
    );
    expect(res.status).toBe(403);
    expect(await prisma.role.findUnique({ where: { id: "role-admin" } })).not.toBeNull();
  });

  it("非系统角色删除成功 + 审计", async () => {
    const res = await deleteRole(
      makeRequest("DELETE", undefined, "/api/settings/roles/role-custom")
    );
    expect(res.status).toBe(200);
    expect(await prisma.role.findUnique({ where: { id: "role-custom" } })).toBeNull();
    await flushAudit();
    expect(
      await prisma.auditLog.findFirstOrThrow({ where: { action: "role.delete" } })
    ).toMatchObject({ resourceId: "role-custom" });
  });

  it("角色不存在 404", async () => {
    const res = await deleteRole(
      makeRequest("DELETE", undefined, "/api/settings/roles/role-missing")
    );
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/web && pnpm vitest run app/api/__tests__/settings-roles.test.ts`
Expected: FAIL（路由还在读 JSON，PG 里没有数据）。

- [ ] **Step 3: 重写 roles/route.ts**

整文件替换 `apps/web/app/api/settings/roles/route.ts`：

```ts
import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, validateBody, handleApiError } from "@/lib/utils";
import { createRoleSchema } from "@/lib/schemas";
import { recordAudit } from "@/lib/services/audit-service";
import { withActor, resolveActor } from "@/lib/context";

const roleInclude = {
  permissions: {
    orderBy: { permissionId: "asc" as const },
    include: { permission: { select: { id: true, resource: true, action: true } } },
  },
  _count: { select: { members: true } },
};

type RoleWithRelations = {
  id: string;
  name: string;
  displayName: string;
  isSystem: boolean;
  description: string | null;
  permissions: { permission: { id: string; resource: string; action: string } }[];
  _count: { members: number };
};

function toRoleResponse(role: RoleWithRelations) {
  return {
    id: role.id,
    name: role.name,
    displayName: role.displayName,
    isSystem: role.isSystem,
    description: role.description,
    _count: { members: role._count.members },
    permissions: role.permissions.map((rp) => ({ permission: rp.permission })),
  };
}

export async function GET() {
  const roles = await prisma.role.findMany({ include: roleInclude });
  return success(roles.map(toRoleResponse));
}

export async function POST(request: NextRequest) {
  const validated = await validateBody(request, createRoleSchema);
  if (!validated.ok) return validated.response;

  try {
    const role = await withActor(resolveActor(request.headers), async () => {
      const created = await prisma.role.create({
        data: {
          name: validated.data.name,
          displayName: validated.data.displayName,
          description: validated.data.description ?? null,
          isSystem: false,
        },
        include: roleInclude,
      });
      recordAudit("role.create", "role", created.id, { name: validated.data.name });
      return toRoleResponse(created);
    });
    return success(role, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
```

- [ ] **Step 4: 重写 roles/[id]/route.ts**

整文件替换 `apps/web/app/api/settings/roles/[id]/route.ts`：

```ts
import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, validateBody, handleApiError } from "@/lib/utils";
import { updateRoleSchema } from "@/lib/schemas";
import { NotFoundError, AuthorizationError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit-service";
import { withActor, resolveActor } from "@/lib/context";

const roleInclude = {
  permissions: {
    orderBy: { permissionId: "asc" as const },
    include: { permission: { select: { id: true, resource: true, action: true } } },
  },
  _count: { select: { members: true } },
};

function toRoleResponse(role: {
  id: string;
  name: string;
  displayName: string;
  isSystem: boolean;
  description: string | null;
  permissions: { permission: { id: string; resource: string; action: string } }[];
  _count: { members: number };
}) {
  return {
    id: role.id,
    name: role.name,
    displayName: role.displayName,
    isSystem: role.isSystem,
    description: role.description,
    _count: { members: role._count.members },
    permissions: role.permissions.map((rp) => ({ permission: rp.permission })),
  };
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const validated = await validateBody(request, updateRoleSchema);
  if (!validated.ok) return validated.response;

  try {
    const role = await withActor(resolveActor(request.headers), async () => {
      const existing = await prisma.role.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError("角色不存在");
      const updated = await prisma.role.update({
        where: { id },
        data: {
          ...(validated.data.displayName !== undefined && {
            displayName: validated.data.displayName,
          }),
          ...(validated.data.description !== undefined && {
            description: validated.data.description,
          }),
        },
        include: roleInclude,
      });
      recordAudit("role.update", "role", id, validated.data);
      return toRoleResponse(updated);
    });
    return success(role);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await withActor(resolveActor(request.headers), async () => {
      const existing = await prisma.role.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError("角色不存在");
      if (existing.isSystem) throw new AuthorizationError("系统角色不可删除");
      await prisma.role.delete({ where: { id } });
      recordAudit("role.delete", "role", id);
    });
    return success({ message: "角色已删除" });
  } catch (err) {
    return handleApiError(err);
  }
}
```

- [ ] **Step 5: 跑测试确认全绿**

Run: `cd apps/web && pnpm vitest run app/api/__tests__/settings-roles.test.ts`
Expected: 全 PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/web/app/api/settings/roles/ apps/web/app/api/__tests__/settings-roles.test.ts
git commit -m "feat(web): settings/roles 路由迁移 Prisma，_count 改真实计数，补齐 API 测试"
```

---

### Task 6: settings/permissions + product-groups 路由重写 + API 测试

**Files:**
- Modify: `apps/web/app/api/settings/permissions/route.ts`
- Modify: `apps/web/app/api/settings/product-groups/route.ts`
- Create: `apps/web/app/api/__tests__/settings-permissions-groups.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/web/app/api/__tests__/settings-permissions-groups.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  GET as listPermissions,
  POST as createPermission,
} from "@/app/api/settings/permissions/route";
import {
  GET as listGroups,
  POST as createGroup,
} from "@/app/api/settings/product-groups/route";
import { prisma } from "@agent-up/db";
import { flushAudit } from "@/lib/services/audit-service";
import { _resetDb } from "@/lib/data/test-db";
import { seedSettings } from "@/lib/__tests__/helpers/seed-db";
import { useTempDataDir, restoreDataDir } from "@/lib/__tests__/helpers/mock-store";

const ACTOR_HEADERS = {
  "Content-Type": "application/json",
  "x-actor-id": "u-test",
  "x-actor-name": "测试员",
  "x-actor-role": "platform_admin",
};

function makeRequest(method: string, body?: unknown, path = "/api/settings/permissions") {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: ACTOR_HEADERS,
  });
}

beforeEach(async () => {
  await _resetDb();
  await seedSettings();
  useTempDataDir();
});
afterEach(restoreDataDir);

describe("GET /api/settings/permissions", () => {
  it("返回含真实 _count.roles 的权限列表", async () => {
    const res = await listPermissions();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const read = data.find((p: { id: string }) => p.id === "perm-1");
    expect(read).toMatchObject({ resource: "agent", action: "read", _count: { roles: 3 } });
    const approve = data.find((p: { id: string }) => p.id === "perm-4");
    expect(approve._count.roles).toBe(1);
  });
});

describe("POST /api/settings/permissions", () => {
  it("创建权限：201 + 审计", async () => {
    const res = await createPermission(
      makeRequest("POST", { resource: "wiki", action: "write", description: "编辑知识页" })
    );
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({ resource: "wiki", action: "write", description: "编辑知识页", _count: { roles: 0 } });
    await flushAudit();
    expect(
      await prisma.auditLog.findFirstOrThrow({ where: { action: "permission.create" } })
    ).toMatchObject({ resource: "permission" });
  });

  it("resource+action 重复 409", async () => {
    const res = await createPermission(makeRequest("POST", { resource: "agent", action: "read" }));
    expect(res.status).toBe(409);
    const { error, code } = await res.json();
    expect(code).toBe("CONFLICT");
  });

  it("校验失败 422", async () => {
    const res = await createPermission(makeRequest("POST", { resource: "wiki" }));
    expect(res.status).toBe(422);
  });
});

describe("GET /api/settings/product-groups", () => {
  it("返回含真实 _count 与时间戳的产品组列表", async () => {
    const res = await listGroups();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const ecs = data.find((g: { id: string }) => g.id === "ecs-group");
    expect(ecs).toMatchObject({
      name: "ecs-group",
      displayName: "ECS 产品组",
      _count: { agents: 1, members: 2 },
    });
    expect(typeof ecs.createdAt).toBe("string");
    expect(typeof ecs.updatedAt).toBe("string");
    const rds = data.find((g: { id: string }) => g.id === "rds-group");
    expect(rds._count).toEqual({ agents: 0, members: 0 });
  });
});

describe("POST /api/settings/product-groups", () => {
  it("创建产品组：201 + 审计", async () => {
    const res = await createGroup(
      makeRequest("POST", { name: "slb-group", displayName: "SLB 产品组" }, "/api/settings/product-groups")
    );
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({
      name: "slb-group",
      displayName: "SLB 产品组",
      description: null,
      _count: { agents: 0, members: 0 },
    });
    await flushAudit();
    expect(
      await prisma.auditLog.findFirstOrThrow({ where: { action: "product_group.create" } })
    ).toMatchObject({ resource: "product-group", userName: "测试员" });
  });

  it("name 重复 409", async () => {
    const res = await createGroup(
      makeRequest("POST", { name: "ecs-group", displayName: "重复组" }, "/api/settings/product-groups")
    );
    expect(res.status).toBe(409);
  });

  it("校验失败 422", async () => {
    const res = await createGroup(makeRequest("POST", { name: "x" }, "/api/settings/product-groups"));
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/web && pnpm vitest run app/api/__tests__/settings-permissions-groups.test.ts`
Expected: FAIL。

- [ ] **Step 3: 重写 permissions/route.ts**

整文件替换 `apps/web/app/api/settings/permissions/route.ts`：

```ts
import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, validateBody, handleApiError } from "@/lib/utils";
import { createPermissionSchema } from "@/lib/schemas";
import { ConflictError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit-service";
import { withActor, resolveActor } from "@/lib/context";

export async function GET() {
  const permissions = await prisma.permission.findMany({
    include: { _count: { select: { roles: true } } },
  });
  return success(
    permissions.map((p) => ({
      id: p.id,
      resource: p.resource,
      action: p.action,
      description: p.description,
      _count: { roles: p._count.roles },
    }))
  );
}

export async function POST(request: NextRequest) {
  const validated = await validateBody(request, createPermissionSchema);
  if (!validated.ok) return validated.response;

  try {
    const perm = await withActor(resolveActor(request.headers), async () => {
      const dup = await prisma.permission.findUnique({
        where: {
          resource_action: {
            resource: validated.data.resource,
            action: validated.data.action,
          },
        },
      });
      if (dup) throw new ConflictError("同名权限已存在");
      const created = await prisma.permission.create({
        data: {
          resource: validated.data.resource,
          action: validated.data.action,
          description: validated.data.description ?? null,
        },
        include: { _count: { select: { roles: true } } },
      });
      recordAudit("permission.create", "permission", created.id, {
        resource: validated.data.resource,
        action: validated.data.action,
      });
      return {
        id: created.id,
        resource: created.resource,
        action: created.action,
        description: created.description,
        _count: { roles: created._count.roles },
      };
    });
    return success(perm, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
```

- [ ] **Step 4: 重写 product-groups/route.ts**

整文件替换 `apps/web/app/api/settings/product-groups/route.ts`：

```ts
import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { success, validateBody, handleApiError } from "@/lib/utils";
import { createProductGroupSchema } from "@/lib/schemas";
import { ConflictError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit-service";
import { withActor, resolveActor } from "@/lib/context";

const groupInclude = { _count: { select: { agents: true, members: true } } };

export async function GET() {
  const groups = await prisma.productGroup.findMany({ include: groupInclude });
  return success(
    groups.map((g) => ({
      id: g.id,
      name: g.name,
      displayName: g.displayName,
      description: g.description,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      _count: { agents: g._count.agents, members: g._count.members },
    }))
  );
}

export async function POST(request: NextRequest) {
  const validated = await validateBody(request, createProductGroupSchema);
  if (!validated.ok) return validated.response;

  try {
    const group = await withActor(resolveActor(request.headers), async () => {
      const dup = await prisma.productGroup.findUnique({
        where: { name: validated.data.name },
      });
      if (dup) throw new ConflictError("同名产品组已存在");
      const created = await prisma.productGroup.create({
        data: {
          name: validated.data.name,
          displayName: validated.data.displayName,
          description: validated.data.description ?? null,
        },
        include: groupInclude,
      });
      recordAudit("product_group.create", "product-group", created.id, {
        name: validated.data.name,
      });
      return {
        id: created.id,
        name: created.name,
        displayName: created.displayName,
        description: created.description,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        _count: { agents: created._count.agents, members: created._count.members },
      };
    });
    return success(group, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
```

- [ ] **Step 5: 跑测试确认全绿**

Run: `cd apps/web && pnpm vitest run app/api/__tests__/settings-permissions-groups.test.ts`
Expected: 全 PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/web/app/api/settings/permissions/ apps/web/app/api/settings/product-groups/ apps/web/app/api/__tests__/settings-permissions-groups.test.ts
git commit -m "feat(web): settings/permissions 与 product-groups 路由迁移 Prisma，唯一冲突 409，补齐 API 测试"
```

---

### Task 7: settings/audit-logs 路由重写 + API 测试

**Files:**
- Modify: `apps/web/app/api/settings/audit-logs/route.ts`
- Create: `apps/web/app/api/__tests__/settings-audit-logs.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/web/app/api/__tests__/settings-audit-logs.test.ts`：

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as listAuditLogs } from "@/app/api/settings/audit-logs/route";
import { _resetDb } from "@/lib/data/test-db";
import { seedAuditLogs } from "@/lib/__tests__/helpers/seed-db";

function makeRequest(query = "") {
  return new NextRequest(`http://localhost/api/settings/audit-logs${query}`);
}

beforeEach(async () => {
  await _resetDb();
  await seedAuditLogs(); // log-001..log-004，createdAt 递增
});

describe("GET /api/settings/audit-logs", () => {
  it("分页元数据与倒序切片", async () => {
    const res = await listAuditLogs(makeRequest("?page=1&pageSize=2"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.items.map((l: { id: string }) => l.id)).toEqual(["log-004", "log-003"]);
    expect(data.pagination).toEqual({
      page: 1,
      pageSize: 2,
      total: 4,
      totalPages: 2,
      hasMore: true,
    });
  });

  it("第二页", async () => {
    const res = await listAuditLogs(makeRequest("?page=2&pageSize=2"));
    const { data } = await res.json();
    expect(data.items.map((l: { id: string }) => l.id)).toEqual(["log-002", "log-001"]);
    expect(data.pagination.hasMore).toBe(false);
  });

  it("action 过滤", async () => {
    const res = await listAuditLogs(makeRequest("?action=role.create"));
    const { data } = await res.json();
    expect(data.items.map((l: { id: string }) => l.id)).toEqual(["log-002"]);
  });

  it("resource + resourceId 组合过滤", async () => {
    const res = await listAuditLogs(makeRequest("?resource=agent&resourceId=ecs-assistant"));
    const { data } = await res.json();
    expect(data.items.map((l: { id: string }) => l.id)).toEqual(["log-001"]);
  });

  it("userName 参数过滤", async () => {
    const res = await listAuditLogs(makeRequest("?userName=pm-chen"));
    const { data } = await res.json();
    expect(data.items.map((l: { id: string }) => l.id)).toEqual(["log-004", "log-001"]);
  });

  it("userId 别名过滤（兼容契约）", async () => {
    const res = await listAuditLogs(makeRequest("?userId=user-wang"));
    const { data } = await res.json();
    expect(data.items.map((l: { id: string }) => l.id)).toEqual(["log-003"]);
  });

  it("返回条目含 userId 与 ISO createdAt", async () => {
    const res = await listAuditLogs(makeRequest("?pageSize=1"));
    const { data } = await res.json();
    expect(data.items[0]).toMatchObject({ userId: "user-chen" });
    expect(typeof data.items[0].createdAt).toBe("string");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/web && pnpm vitest run app/api/__tests__/settings-audit-logs.test.ts`
Expected: FAIL（路由还在读 JSON）。

- [ ] **Step 3: 重写 route.ts**

整文件替换 `apps/web/app/api/settings/audit-logs/route.ts`：

```ts
import { NextRequest } from "next/server";
import { success, parsePagination, paginationMeta } from "@/lib/utils";
import { listAudit } from "@/lib/services/audit-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip, take } = parsePagination(searchParams);

  const items = await listAudit({
    action: searchParams.get("action") || undefined,
    resource: searchParams.get("resource") || undefined,
    resourceId: searchParams.get("resourceId") || undefined,
    // 兼容：审计主键是 userName；userId 作为查询别名
    user: searchParams.get("userName") || searchParams.get("userId") || undefined,
  });

  const total = items.length;
  return success({
    items: items.slice(skip, skip + take),
    pagination: paginationMeta(page, pageSize, total),
  });
}
```

- [ ] **Step 4: 跑测试确认全绿**

Run: `cd apps/web && pnpm vitest run app/api/__tests__/settings-audit-logs.test.ts`
Expected: 全 PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/app/api/settings/audit-logs/ apps/web/app/api/__tests__/settings-audit-logs.test.ts
git commit -m "feat(web): settings/audit-logs 路由迁移 Prisma，userId 别名过滤保留"
```

---

### Task 8: 终验 + 终审记录回写

- [ ] **Step 1: 全量质量门**

Run: `cd apps/web && pnpm vitest run`
Expected: 新增/改写的 5 个测试文件全 PASS；既有失败仅限已知清单（maas-usage 2 个、feedback-ingest 集合错误——并行会话领域）。**不允许出现任何新增失败。**

Run: `pnpm lint && pnpm build`（仓库根）
Expected: 通过。

Run: `docker exec $(docker ps -qf name=postgres) psql -U agentup -d agentup -c "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='AuditLog' AND column_name='userId';"`
Expected: `userId | YES`（列存在且可空）。

- [ ] **Step 2: 验证双写桥在生产路径仍工作**

Run: `cd apps/web && pnpm vitest run app/api/__tests__/settings-roles.test.ts app/api/__tests__/agents.test.ts`
Expected: 两套件同绿——说明 PG 断言与 JSON 审计断言并存无冲突。

- [ ] **Step 3: 终审记录回写计划文档**

在本文档末尾追加「终审记录」小节：修复清单、遗留裁决点（含 feedback-ingest.test.ts 的处置结果）。

- [ ] **Step 4: 提交**

```bash
git add docs/superpowers/plans/2026-09-11-prisma-persistence-batch1.md
git commit -m "docs(plans): 批1 终审记录回写"
```

---

## 验收标准

1. `app/api/settings/**` 5 个路由全部走 Prisma，public 契约（路径、入参、响应形状、状态码语义）不变；新增 409 语义（D7）。
2. audit-service：Prisma 事实源 + JSON 双写镜像；`recordAudit` 签名与 fire-and-forget 语义不变；`listAudit` 异步化并新增 `user` 过滤；`flushAudit` 供测试。
3. per-worker 独立测试库落地，`_resetDb` 语义不变；`pnpm test` 硬依赖可达 PostgreSQL（CI/本地均已具备）。
4. 13 个未迁移套件的审计断言零改动通过。
5. 全量测试无新增失败；lint / build 通过。

## 批次衔接

- 批2（feedback+skills+wiki+retrieval）开工时：迁移各套件审计断言到 Prisma（`flushAudit` + `prisma.auditLog`），逐步缩小 JSON 镜像的消费者集合；批5 删镜像。
- 批4 需裁决：Trace/EvalCase→Agent 外键 ON DELETE RESTRICT vs 运行时无约束（批0 裁决②，本批不涉及）。
