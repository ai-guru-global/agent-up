# 批5（收官批）实施计划 —— db:seed 全局种子 + 拆除 JSON 存储层

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除最后的 JSON 存储残留（audit 镜像、dashboard 路由、store.ts、data/ 目录），提供全局 db:seed 种子与 demo 模式共享数据集，文档同步到「运行时全量 Prisma」口径。

**Architecture:** 演示数据集单一事实源 `packages/db/prisma/seed-data.mjs`（纯 JS 对象，保持 JSON 时代形状），被 `seed.mjs`（写 PG）与 `demo/seed.ts`（浏览器演示态）共同消费；运行时业务读写全部走 Prisma，`lib/data/store.ts` 与 `apps/web/data/` 彻底删除。

**Tech Stack:** Next.js 16 App Router、Prisma 6 + PostgreSQL、vitest、turbo。

---

## 关键决策

- **D1 演示数据集单一事实源**：新增 `packages/db/prisma/seed-data.mjs`（零依赖纯对象模块，保持 JSON 文件时代的原始形状，含 `_count`/嵌套 version 等演示字段）。`apps/web/demo/seed.ts` 原本逐文件 `import "../data/*.json"`（24 个 import），改为一次 `import { seedData } from "@agent-up/db/prisma/seed-data.mjs"`；`packages/db/package.json` 无 exports 限制 + web 侧 `allowJs: true`，深导入可直接解析。
- **D2 audit-logs.json 去噪**：该文件 669 条中仅 5 条是手工演示条目（log-001..005），其余 664 条是测试运行噪音被提交。种子数据集只保留 5 条手工条目。
- **D3 补建初始发布行**：JSON 时代 ver-001.releaseId="rel-000"、ver-rds-001.releaseId="rel-rds-000" 是悬挂引用（无对应 Release 文件）；PG 中 `AgentVersion.releaseId` 是必填 FK，seed 必须补建这两条 APPROVED 状态的初始 Release 行。
- **D4 users 补齐**：JSON 时代无 users.json（仅测试夹具造过 user-chen/user-wang）。种子按演示数据中出现的 actor 名补齐 6 个用户（admin-zhao/pm-chen/cre-wang/cre-zhang/eng-li/cre-li）+ UserRole + 产品组成员（ecs-group 3 人 LEAD=pm-chen；rds-group 2 人 LEAD=eng-li，与 product-groups.json `_count.members` 一致）。
- **D5 技能版本与绑定补齐**：`_count.versions: 2`（ticket-lookup）/`1`（wiki-search）落为真实 SkillVersion 行；ecs-assistant 补 1 条 AgentSkillBinding（↔ ticket-lookup，与 agents JSON `_count.skillBindings` 一致）。
- **D6 不种子的内容**：`data/traces/`（运行时噪音）、ConfigChange、WikiIngestJob 不进种子；WikiPage.content 用 summary 充当正文（JSON 时代只有 summary）、sourceRefs=[]。
- **D7 seed 幂等**：seed.mjs 先按逆 FK 序 deleteMany 全表再插入，可重复执行。
- **D8 镜像拆除顺序**：T1（dashboard）→ T2（audit 镜像）→ T3（store 删除），保证每个提交点 vitest/tsc 全绿；T4（seed 脚本）独立可并行；T5（demo 切换 + data/ 删除）依赖 T4。
- **D9 文档口径**：`docs/distilled/` 是历史蒸馏快照（有 source_commit frontmatter），不改写；只更新 README（apps/web + 根）与 roadmap 页中描述**当前**架构的表述。

## 提交规范

沿用批3/批4：全部 `git add <指定文件>` + `git commit -- <指定路径>`（并行会话同时在提交，禁止裸 `git commit -a`）；不 push；不触碰并行会话的未提交 WIP（`demo/mock-server.ts` 的修改、`demo/mock-server 2.ts`）。

---

## Task 1（T1）: dashboard 路由迁移 Prisma + 新增测试

**Files:**
- Modify: `apps/web/app/api/dashboard/route.ts`
- Create: `apps/web/app/api/__tests__/dashboard.test.ts`

- [ ] 重写 route.ts：`prisma.agent.findMany`（id/name/status）计数 total/active；`prisma.feedback.count`（total / pending=status in NEW,TRIAGED,ASSIGNED,IN_PROGRESS）；`prisma.release.count`（PENDING）；recentFeedback/recentReleases 用 `findMany({orderBy:[{submittedAt:"desc"},{id:"desc"}], take:5, include:{agent:{select:{id,name}}}})`，响应形状与 JSON 时代逐字段一致（`agents:{total,active}` / `feedback:{total,pending}` / `releases:{pending}` / recent 数组 spread + `agent`）。
- [ ] 新增 dashboard.test.ts：`_resetDb` + seedAgent 后建 2 agent（一 ACTIVE 一 DRAFT）、3 feedback（NEW/RESOLVED/POSITIVE…覆盖 pending 口径）、1 PENDING + 1 APPROVED release；断言计数与 recent 排序（submittedAt desc 取 5）、`agent` 嵌套形状。
- [ ] `pnpm --filter web exec vitest run app/api/__tests__/dashboard.test.ts` + `pnpm --filter web exec tsc --noEmit` 全绿。
- [ ] pathspec 提交。

## Task 2（T2）: 拆除 audit JSON 镜像

**Files:**
- Modify: `apps/web/lib/services/audit-service.ts`
- Modify: `apps/web/lib/__tests__/audit-service.test.ts`
- Modify: `apps/web/app/api/__tests__/feedback-ingest.test.ts`
- Modify: `apps/web/app/api/__tests__/feedback-skills-wiki.test.ts`

- [ ] audit-service.ts：删 `import { store }`、`AUDIT_FILE`、`appendJsonMirror` 及 line 101 调用；头注释去掉迁移期镜像说明。保留 pendingWrites/track/flushAudit/recordAudit PG 写/listAudit。
- [ ] audit-service.test.ts：删除「桥接期同步镜像写 audit-logs.json（批5 移除）」用例及相关 useTempDataDir 引用。
- [ ] feedback-ingest.test.ts：删 `clearRuntimeData`/`useTempDataDir`（PG `_resetDb` 已覆盖确定性）；beforeEach 只剩 resetActor + _resetDb。
- [ ] feedback-skills-wiki.test.ts:46：镜像读改为 `await flushAudit()` + `listAudit()` 断言 action=feedback.create。
- [ ] 相关 vitest + tsc 全绿；pathspec 提交。

## Task 3（T3）: 删除 store.ts/_setDataDir/mock-store 及全部残留引用

**Files:**
- Delete: `apps/web/lib/data/store.ts`、`apps/web/lib/__tests__/store.test.ts`、`apps/web/lib/__tests__/helpers/mock-store.ts`
- Modify: ~16 个测试文件（去 useTempDataDir/restoreDataDir 导入与调用，列表以 grep 为准）
- Modify: `apps/web/vitest.config.ts`（coverage.include 去 `lib/data/store.ts`）、`apps/web/lib/data/test-db.ts`（注释更新）

- [ ] grep `useTempDataDir|restoreDataDir|_setDataDir|@/lib/data/store` 得精确文件清单，逐一清理。
- [ ] 全量 `tsc --noEmit` + `vitest run`（应为 347±镜像用例数）全绿。
- [ ] pathspec 提交。

## Task 4（T4）: db:seed 全局种子脚本

**Files:**
- Create: `packages/db/prisma/seed-data.mjs`（seedData：users/userRoles/permissions/roles/rolePermissions/productGroups/productGroupMembers/agents/wikiVaults/wikiPages/skills/skillVersions/skillBindings/releases/versions/feedback/evalCases/auditLogs）
- Create: `packages/db/prisma/seed.mjs`
- Modify: `packages/db/package.json`（`"prisma": {"seed": "node prisma/seed.mjs"}` + `"db:seed": "node prisma/seed.mjs"`）
- Modify: `turbo.json`（新增 db:seed 任务，cache:false）

- [ ] seed-data.mjs：按 data/*.json 原形状录入（id 全部保留），应用 D2-D5 补齐；agents 内嵌四分区配置原样保留。
- [ ] seed.mjs：内联读取 `packages/db/.env`（无 dotenv 依赖）；逆 FK 序清库 → FK 序插入（User→ProductGroup→Member→Permission→Role→RolePermission→UserRole→Agent→WikiVault→WikiPage→四分区配置→Skill→SkillVersion→SkillBinding→Release(4 条，含 rel-000/rel-rds-000)→AgentVersion→Feedback→EvalCase→AuditLog(5 条)）；ISO 字符串转 Date；Json 列直接传对象。
- [ ] `pnpm --filter @agent-up/db exec prisma db seed` 跑通；psql 抽查 counts（agent=2、feedback=3、release=4、agent_version=3、wiki_page=4、audit_log=5、user=6、skill_version=3、agent_skill_binding=1）。
- [ ] pathspec 提交。

## Task 5（T5）: demo 切换共享数据集 + 删除 data/ 目录

**Files:**
- Modify: `apps/web/demo/seed.ts`（24 个 JSON import → 1 个 seedData 深导入；wikiPages Record 由扁平数组按 vaultId 分组）
- Delete: `apps/web/data/`（git rm 24 个 tracked 文件 + 清理未跟踪 .DS_Store/traces 残留）

- [ ] demo/seed.ts 改造后 `createInitialState` 语义不变（traces: []、reservedAgentPool 不变）。
- [ ] `git rm -r data`；确认 `grep -rn "data/"` 无运行时/构建引用残留（README 除外，T6 处理）。
- [ ] `pnpm --filter web exec tsc --noEmit` + `pnpm --filter web run build` + `pnpm --filter web run build:demo` 全绿。
- [ ] pathspec 提交。

## Task 6（T6）: docs 同步 + 全量门禁 + 终审记录回写

**Files:**
- Modify: `apps/web/README.md`（L11 测试描述、L17 数据源、L29/L31 目录表行删除）
- Modify: 根 `README.md`（L72 数据库口径、目录树 store.ts/data/ 行、L140-155 运行形态与架构图、L178-179 基础设施说明、L197 测试文件清单、L205/208 运行形态与 demo 说明、L232 数据源、L392 里程碑表、L429/445-460 FAQ）
- Modify: `apps/web/app/(dashboard)/architecture/roadmap/page.tsx`（L97/L334 状态句、L111/L117 Prisma 路线条目标记完成、L233/238/244 历史表述按需微调）

- [ ] 全量门禁：`tsc --noEmit`、`vitest run`、`pnpm --filter web run lint`、`build`。
- [ ] 残留 grep：`_setDataDir|readArray|writeArray|@/lib/data/store|data/settings|audit-logs.json` 在 apps/web 源码（非测试快照）应为 0（除 distilled 文档）。
- [ ] 本计划文档回写终审记录（门禁结果、提交清单、遗留裁决点）。
- [ ] pathspec 提交。
