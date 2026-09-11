# 批5（收官批）实施计划 —— db:seed 全局种子 + 拆除 JSON 存储层

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

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

- [x] 重写 route.ts：`prisma.agent.findMany`（id/name/status）计数 total/active；`prisma.feedback.count`（total / pending=status in NEW,TRIAGED,ASSIGNED,IN_PROGRESS）；`prisma.release.count`（PENDING）；recentFeedback/recentReleases 用 `findMany({orderBy:[{submittedAt:"desc"},{id:"desc"}], take:5, include:{agent:{select:{id,name}}}})`，响应形状与 JSON 时代逐字段一致（`agents:{total,active}` / `feedback:{total,pending}` / `releases:{pending}` / recent 数组 spread + `agent`）。
- [x] 新增 dashboard.test.ts：`_resetDb` + seedAgent 后建 2 agent（一 ACTIVE 一 DRAFT）、3 feedback（NEW/RESOLVED/POSITIVE…覆盖 pending 口径）、1 PENDING + 1 APPROVED release；断言计数与 recent 排序（submittedAt desc 取 5）、`agent` 嵌套形状。
- [x] `pnpm --filter web exec vitest run app/api/__tests__/dashboard.test.ts` + `pnpm --filter web exec tsc --noEmit` 全绿。
- [x] pathspec 提交。

## Task 2（T2）: 拆除 audit JSON 镜像

**Files:**
- Modify: `apps/web/lib/services/audit-service.ts`
- Modify: `apps/web/lib/__tests__/audit-service.test.ts`
- Modify: `apps/web/app/api/__tests__/feedback-ingest.test.ts`
- Modify: `apps/web/app/api/__tests__/feedback-skills-wiki.test.ts`

- [x] audit-service.ts：删 `import { store }`、`AUDIT_FILE`、`appendJsonMirror` 及 line 101 调用；头注释去掉迁移期镜像说明。保留 pendingWrites/track/flushAudit/recordAudit PG 写/listAudit。
- [x] audit-service.test.ts：删除「桥接期同步镜像写 audit-logs.json（批5 移除）」用例及相关 useTempDataDir 引用。
- [x] feedback-ingest.test.ts：删 `clearRuntimeData`/`useTempDataDir`（PG `_resetDb` 已覆盖确定性）；beforeEach 只剩 resetActor + _resetDb。
- [x] feedback-skills-wiki.test.ts:46：镜像读改为 `await flushAudit()` + `listAudit()` 断言 action=feedback.create。
- [x] 相关 vitest + tsc 全绿；pathspec 提交。

## Task 3（T3）: 删除 store.ts/_setDataDir/mock-store 及全部残留引用

**Files:**
- Delete: `apps/web/lib/data/store.ts`、`apps/web/lib/__tests__/store.test.ts`、`apps/web/lib/__tests__/helpers/mock-store.ts`
- Modify: ~16 个测试文件（去 useTempDataDir/restoreDataDir 导入与调用，列表以 grep 为准）
- Modify: `apps/web/vitest.config.ts`（coverage.include 去 `lib/data/store.ts`）、`apps/web/lib/data/test-db.ts`（注释更新）

- [x] grep `useTempDataDir|restoreDataDir|_setDataDir|@/lib/data/store` 得精确文件清单，逐一清理。
- [x] 全量 `tsc --noEmit` + `vitest run`（应为 347±镜像用例数）全绿。
- [x] pathspec 提交。

## Task 4（T4）: db:seed 全局种子脚本

**Files:**
- Create: `packages/db/prisma/seed-data.mjs`（seedData：users/userRoles/permissions/roles/rolePermissions/productGroups/productGroupMembers/agents/wikiVaults/wikiPages/skills/skillVersions/skillBindings/releases/versions/feedback/evalCases/auditLogs）
- Create: `packages/db/prisma/seed.mjs`
- Modify: `packages/db/package.json`（`"prisma": {"seed": "node prisma/seed.mjs"}` + `"db:seed": "node prisma/seed.mjs"`）
- Modify: `turbo.json`（新增 db:seed 任务，cache:false）

- [x] seed-data.mjs：按 data/*.json 原形状录入（id 全部保留），应用 D2-D5 补齐；agents 内嵌四分区配置原样保留。
- [x] seed.mjs：内联读取 `packages/db/.env`（无 dotenv 依赖）；逆 FK 序清库 → FK 序插入（User→ProductGroup→Member→Permission→Role→RolePermission→UserRole→Agent→WikiVault→WikiPage→四分区配置→Skill→SkillVersion→SkillBinding→Release(4 条，含 rel-000/rel-rds-000)→AgentVersion→Feedback→EvalCase→AuditLog(5 条)）；ISO 字符串转 Date；Json 列直接传对象。
- [x] `pnpm --filter @agent-up/db exec prisma db seed` 跑通；psql 抽查 counts（agent=2、feedback=3、release=4、agent_version=3、wiki_page=4、audit_log=5、user=6、skill_version=3、agent_skill_binding=1）。
- [x] pathspec 提交。

## Task 5（T5）: demo 切换共享数据集 + 删除 data/ 目录

**Files:**
- Modify: `apps/web/demo/seed.ts`（24 个 JSON import → 1 个 seedData 深导入；wikiPages Record 由扁平数组按 vaultId 分组）
- Delete: `apps/web/data/`（git rm 24 个 tracked 文件 + 清理未跟踪 .DS_Store/traces 残留）

- [x] demo/seed.ts 改造后 `createInitialState` 语义不变（traces: []、reservedAgentPool 不变）。
- [x] `git rm -r data`；确认 `grep -rn "data/"` 无运行时/构建引用残留（README 除外，T6 处理）。
- [x] `pnpm --filter web exec tsc --noEmit` + `pnpm --filter web run build` + `pnpm --filter web run build:demo` 全绿。
- [x] pathspec 提交。

## Task 6（T6）: docs 同步 + 全量门禁 + 终审记录回写

**Files:**
- Modify: `apps/web/README.md`（L11 测试描述、L17 数据源、L29/L31 目录表行删除）
- Modify: 根 `README.md`（L72 数据库口径、目录树 store.ts/data/ 行、L140-155 运行形态与架构图、L178-179 基础设施说明、L197 测试文件清单、L205/208 运行形态与 demo 说明、L232 数据源、L392 里程碑表、L429/445-460 FAQ）
- Modify: `apps/web/app/(dashboard)/architecture/roadmap/page.tsx`（L97/L334 状态句、L111/L117 Prisma 路线条目标记完成、L233/238/244 历史表述按需微调）

- [x] 全量门禁：`tsc --noEmit`、`vitest run`、`pnpm --filter web run lint`、`build`。
- [x] 残留 grep：`_setDataDir|readArray|writeArray|@/lib/data/store|data/settings|audit-logs.json` 在 apps/web 源码（非测试快照）应为 0（除 distilled 文档）。
- [x] 本计划文档回写终审记录（门禁结果、提交清单、遗留裁决点）。
- [x] pathspec 提交。

---

## 终审记录（2026-09-12 回写）

### 执行结果

T1-T6 全部完成，JSON 存储层已彻底移除：运行时唯一数据通道为 Prisma → PostgreSQL，演示数据集单一事实源为 `packages/db/prisma/seed-data.mjs`（seed.mjs 与 demo/seed.ts 共同消费）。

### 提交清单（全部 pathspec 提交，未 push）

| 提交 | 内容 |
|------|------|
| `625e114` | 批5 计划文档 |
| `e3cbfde` | T1 dashboard 路由迁移 Prisma + dashboard.test.ts（3 测试） |
| `e5d28df` | T2 拆除 audit JSON 镜像（audit-service + 3 个测试文件） |
| `2cbe99d` | T3 删除 store.ts / store.test.ts（15 用例）/ mock-store + 14 个测试文件清理 + vitest coverage include 收缩 |
| `e65a0da` | T4 seed-data.mjs + seed.mjs + packages/db package.json（prisma.seed + db:seed）+ turbo.json db:seed 任务 |
| `da76c7b` | T5 demo/seed.ts 切共享数据集 + git rm data/ 24 文件（−8641 行）+ 14 处 UI 文案改 PostgreSQL 口径 + .gitignore 清理 |
| `fae072e` | T6 的一部分（apps/web/README.md + roadmap 页 13+/14−）——被并行会话的杂项提交 `update` 卷入，内容完整但归属不洁，如实记录 |
| 本提交 | T6 其余文档同步（根 README、deployment/troubleshooting 指南、GTM 事实口径表、chrome-extension README）+ 终审记录 |

### 门禁结果（T6 收口时点）

- `pnpm --filter web exec tsc --noEmit`：0 错误
- `pnpm --filter web exec vitest run`：**334/334 通过，33 个文件**（16 lib + 17 api；批4 结束时 347 − 1 镜像用例 − 15 store 用例 + 3 dashboard）
- `pnpm --filter web run lint`：0 problems
- `pnpm --filter web run build`：41 路由全绿（Turbopack 对 `export * from "@prisma/client"` 有 1 条 CJS 运行时导出警告，批0 起即存在，cosmetic）
- `pnpm --filter web run build:demo`：27 页静态导出全绿（验证 seed-data.mjs 深导入在 DEMO_EXPORT 下可解析）
- seed 幂等：连续两次 `prisma db seed` 成功；psql 抽查 agent=2、feedback=3、release=4（rel-000/001 APPROVED、rel-002 PENDING、rel-rds-000 APPROVED）、agent_version=3、skill_version=3（2+1）、audit_log=5、user=6

### 残留 grep 判定

`_setDataDir|readArray|writeArray|@/lib/data/store|data/settings|audit-logs.json|apps/web/data` 全仓命中已分类：源码 0（roadmap 页 2 处为**有意保留**的历史轮次行，已加「被取代」注）；活跃文档 0（deployment/troubleshooting/GTM/chrome-extension README 已同步）；其余命中均为有意保留的历史记录（docs/superpowers 计划与规格、docs/reports、docs/distilled、.zcode 计划、.qoder repowiki）。

### 执行期修复

1. **seed 二次运行 P2002**：clearAll() 漏了 `skill.deleteMany()`（26 个模型唯一遗漏）；首次运行碰巧成功、二次运行中途崩溃留下混合状态。补行后连续两次干净运行验证。
2. **Edit 前必须 Read**：4 个页面文件的文案编辑因会话压缩后未重读而失败，Read 目标片段后重放。
3. **lint 孤儿导入**：3 个测试文件（evidence-chain / maas-usage / version-lineage）在删除空 afterEach 块后留下未使用的 afterEach 导入，逐一移除。
4. **feedback-ingest.test.ts 断供**：T2 清理 import 块时误删了仍在使用的 `prisma` 导入，grep 复查后补回。

### 遗留裁决点（留给后续批次 / 用户裁决）

1. **docs/skills/agent-up-services/ 的 stub 知识库**仍按 JSON 时代描述 audit 镜像与 store 约定（内容锚定 docs/distilled 的 source_commit）；更新需重新蒸馏，超出批5 范围（D9）。回答服务层问题时应注意其审计/存储描述已过期。
2. **并行会话产物未触碰**：`apps/web/README 2.md`、`apps/web/demo/mock-server 2.ts`、并行会话的 `demo/mock-server.ts` 修改，均保持原状。
3. **Turbopack 警告**：`export *` 消费 CJS @prisma/client 的构建警告仍在，消除需改 packages/db/client.ts 为显式具名导出，属可选优化。
4. **审计历史起点**：演示库审计记录从 5 条手工条目（log-001..005）开始，不包含 JSON 时代被提交的 664 条测试噪音（D2 有意为之）。
5. **NextAuth / RBAC** 与 **部署运维基线** 两个后续子项目未启动，等用户授权。
