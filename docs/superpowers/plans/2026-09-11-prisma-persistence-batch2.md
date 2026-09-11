# 批2 实现计划：feedback / skill / wiki / retrieval 迁移 Prisma

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 四个服务（feedback、skill、wiki、retrieval）的存储层从 JSON store 切到 Prisma，公开契约（路由路径、入参、响应形状、状态码语义）不变；审计镜像消费者集合进一步缩小。

**Architecture:** 沿用批1 的 strangler 模式：service 层重写为 prisma.*，路由不动（除 agents/[id]/skills DELETE 补 withActor 修复审计署名）；审计仍走 recordAudit 双写镜像（批5 删）；测试以 `_resetDb` + PG 种子替代 `useTempDataDir` JSON 种子。批2 特有：schema 枚举与运行时漂移严重，先做 schema 对齐迁移再迁服务。

**Tech Stack:** Prisma 6.19.3 / PostgreSQL / Vitest 3（per-worker 测试库）/ Zod

---

## 决策（D1–D8）

| # | 决策 | 理由 |
| --- | --- | --- |
| D1 | `Feedback.source` 从 `FeedbackSource` 枚举改为 `String @default("MANUAL")` | 运行时把渠道名（`generic`/`ticket-webhook`）直接存 source 并原样回显（测试断言 `fb.source === "generic"`）；且服务注释明确「新渠道 = 加适配器不改存储」，值集合开放 → 文本列才是正确建模 |
| D2 | 新增 `externalRefId`/`externalRefUrl` 平铺列，响应层重组 `externalRef: {id,url}` 对象 | 运行时 ingest 存 `externalRef` 对象并按「渠道+单号」幂等查询；平铺列可走普通 findFirst 索引查询，避免 JSON path 过滤 |
| D3 | Wiki 三枚举改为**新旧两套值域的并集**：`Provenance`（EXTRACTED/INFERRED/AMBIGUOUS/SYNTHESIZED/AUTHORED/DISTILLED/IMPORTED）、`PageLifecycle`（DRAFT/REVIEWED/VERIFIED/DISPUTED/ARCHIVED/IN_REVIEW/STALE/DEPRECATED）、`PageTier`（CORE/SUPPORTING/PERIPHERAL/SPECIALIZED/EDGE_CASE），tier 默认 SPECIALIZED | 运行时实际并存两套：UI 字典与种子 JSON 用旧值（REVIEWED/SUPPORTING），路由 zod 用新值（IN_REVIEW/SPECIALIZED）；两套都是真实流量，枚举取并集则任意存量行无需 CASE 映射即可换型，后续任何一端收敛都不用再动库 |
| D4 | `WikiPage.vault`、`WikiIngestJob.vault` 外键改 ON DELETE CASCADE（KnowledgeConfig.wikiVaultId 保持 SetNull） | 运行时 deleteVault 语义=整库连页面一起消失（fs 递归删目录）；RESTRICT 会让 vault 删除撞 P2003。KnowledgeConfig 是 Agent 侧配置，链接断开置空即可 |
| D5 | `AgentSkillBinding.allowedScopes String[] @default([])` | 运行时 binding 无此字段；无默认值则 create 必填， 迁移无意义负担 |
| D6 | Skill 重名 / WikiPage 同库重复 slug → 预检抛 `ConflictError`（409） | 与批1 D7 一致：schema 唯一约束是既定意图，静默违反变 500 不如显式 409 |
| D7 | binding 响应不存快照、改 include 实时取 skill 摘要（`{id,name,displayName}`），`boundAt` 映射为旧字段名 `createdAt` | PG 有关联查询能力，快照不同步是 JSON 时代已知坑（skill stub 坑5）；响应键名保持旧契约 |
| D8 | 批2 被破坏的并行会话测试（feedback-ingest、feedback-skills-wiki）按既有授权最小补丁：JSON 建档/读档改 PG 查询，断言结构不动 | 与批1 对 feedback-ingest 的处置同一授权与同一原则 |

**范围外（留给后续批次）：** feedback 状态机已知的 assignedTo/verificationNote 静默丢弃坑与终态可改字段坑（行为契约，不属持久化迁移）；toggleSkillBinding 无审计（死代码）；vault 统计字段静态不回写（运行时契约）；`db:seed`（批5）。

---

## Task 1: schema 漂移对齐 + 手写迁移

**Files:**
- Modify: `packages/db/prisma/schema.prisma`（Feedback、AgentSkillBinding、WikiPage、WikiIngestJob、三个枚举）
- Create: `packages/db/prisma/migrations/20260911170000_feedback_wiki_runtime_align/migration.sql`

**Step 1.1** schema 编辑（5 处）：

```prisma
model Feedback {
  // source 由 FeedbackSource 枚举改 String：运行时存渠道名（generic/ticket-webhook），
  // 渠道集合开放（新渠道=加适配器不改存储），回显原样字符串
  source          String           @default("MANUAL")
  // 多渠道工单接入的外部单号（幂等键），响应层重组为 externalRef 对象
  externalRefId   String?
  externalRefUrl  String?
  // 其余字段不动
}

model AgentSkillBinding {
  // 运行时 binding 无 allowedScopes，给空数组默认
  allowedScopes String[] @default([])
}

model WikiPage {
  vault WikiVault @relation(fields: [vaultId], references: [id], onDelete: Cascade)
}

model WikiIngestJob {
  vault WikiVault @relation(fields: [vaultId], references: [id], onDelete: Cascade)
}

enum Provenance {
  AUTHORED
  EXTRACTED
  DISTILLED
  IMPORTED
  SYNTHESIZED
}

enum PageLifecycle {
  DRAFT
  IN_REVIEW
  VERIFIED
  STALE
  DEPRECATED
}

enum PageTier {
  CORE
  SPECIALIZED
  EDGE_CASE
}
// tier 列默认值同步改：
//   tier PageTier @default(SPECIALIZED)
```

**Step 1.2** 手写迁移 SQL（枚举值替换不能用简单 cast——存量值不在新集合会炸）：

```sql
-- Feedback.source：枚举 → 文本（渠道名开放集合，D1）
ALTER TABLE "Feedback" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "Feedback" ALTER COLUMN "source" TYPE TEXT USING "source"::text;
ALTER TABLE "Feedback" ALTER COLUMN "source" SET DEFAULT 'MANUAL';
DROP TYPE "FeedbackSource";

-- Feedback：外部单号平铺列（D2）
ALTER TABLE "Feedback" ADD COLUMN "externalRefId" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "externalRefUrl" TEXT;

-- AgentSkillBinding.allowedScopes 默认空数组（D5）
ALTER TABLE "AgentSkillBinding" ALTER COLUMN "allowedScopes" SET DEFAULT '{}'::text[];

-- Wiki 三枚举换型为并集值域（D3）：存量值都在新集合内，直接 text cast，无需映射
CREATE TYPE "PageLifecycle_new" AS ENUM ('DRAFT', 'REVIEWED', 'VERIFIED', 'DISPUTED', 'ARCHIVED', 'IN_REVIEW', 'STALE', 'DEPRECATED');
ALTER TABLE "WikiPage" ALTER COLUMN "lifecycle" DROP DEFAULT;
ALTER TABLE "WikiPage" ALTER COLUMN "lifecycle" TYPE "PageLifecycle_new" USING "lifecycle"::text::"PageLifecycle_new";
ALTER TABLE "WikiPage" ALTER COLUMN "lifecycle" SET DEFAULT 'DRAFT';
DROP TYPE "PageLifecycle";
ALTER TYPE "PageLifecycle_new" RENAME TO "PageLifecycle";

CREATE TYPE "PageTier_new" AS ENUM ('CORE', 'SUPPORTING', 'PERIPHERAL', 'SPECIALIZED', 'EDGE_CASE');
ALTER TABLE "WikiPage" ALTER COLUMN "tier" DROP DEFAULT;
ALTER TABLE "WikiPage" ALTER COLUMN "tier" TYPE "PageTier_new" USING "tier"::text::"PageTier_new";
ALTER TABLE "WikiPage" ALTER COLUMN "tier" SET DEFAULT 'SPECIALIZED';
DROP TYPE "PageTier";
ALTER TYPE "PageTier_new" RENAME TO "PageTier";

CREATE TYPE "Provenance_new" AS ENUM ('EXTRACTED', 'INFERRED', 'AMBIGUOUS', 'SYNTHESIZED', 'AUTHORED', 'DISTILLED', 'IMPORTED');
ALTER TABLE "WikiPage" ALTER COLUMN "provenance" DROP DEFAULT;
ALTER TABLE "WikiPage" ALTER COLUMN "provenance" TYPE "Provenance_new" USING "provenance"::text::"Provenance_new";
ALTER TABLE "WikiPage" ALTER COLUMN "provenance" SET DEFAULT 'EXTRACTED';
DROP TYPE "Provenance";
ALTER TYPE "Provenance_new" RENAME TO "Provenance";

-- Vault 删除级联（D4）：RESTRICT → CASCADE
ALTER TABLE "WikiPage" DROP CONSTRAINT "WikiPage_vaultId_fkey";
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "WikiVault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiIngestJob" DROP CONSTRAINT "WikiIngestJob_vaultId_fkey";
ALTER TABLE "WikiIngestJob" ADD CONSTRAINT "WikiIngestJob_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "WikiVault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

**Step 1.3** 应用与验证：

```bash
pnpm --filter @agent-up/db exec prisma generate
pnpm --filter @agent-up/db exec prisma migrate deploy   # dev 库
docker exec $(docker ps -qf name=postgres) psql -U agentup -d agentup -c \
  "SELECT column_name,data_type FROM information_schema.columns WHERE table_name='Feedback' AND column_name IN ('source','externalRefId');"
```
Expected: `source | text`、`externalRefId | text`。worker 测试库由 globalSetup 自动 deploy。

**Step 1.4** Commit（pathspec）：
```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260911170000_feedback_wiki_runtime_align/migration.sql
git commit -m "fix(db): Feedback.source 改文本列+外部单号平铺列，Wiki 三枚举对齐运行时值，vault 级联删除（批2 schema 对齐）" -- packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260911170000_feedback_wiki_runtime_align/migration.sql
```

---

## Task 2: feedback-service 重写

**Files:**
- Rewrite: `apps/web/lib/services/feedback-service.ts`
- Rewrite: `apps/web/lib/__tests__/feedback-service.test.ts`

服务重写要点（状态机 `ALLOWED_TRANSITIONS`/`assertTransition`、`CHANNEL_ADAPTERS`、`PRIORITY_TO_SEVERITY` 原样保留）：

- `withAgentName` → `toFeedbackResponse(row)` 映射器：`tags` 展开为数组；`submittedAt/assignedAt/resolvedAt/verifiedAt` 转 ISO；`externalRefId !== null` 时输出 `externalRef: { id, url }`（对齐旧契约：手工创建无此键）；`assignedTo/resolution/verificationNote` 为 null 时省略键（对齐旧 JSON 的「设置后才出现」）；`agent: row.agent ?? null`。
- `listFeedback`：`prisma.feedback.findMany` + `where`（status/severity/rating 跳过 "ALL"；tag 用 `tags: { has: tag }`）+ `orderBy: [{ submittedAt: "desc" }]` + `count`；include agent。
- `createFeedback`：`prisma.agent.findUnique` 校验 → `prisma.feedback.create`（id 交 cuid；`submittedBy: getActor().id`；`sessionData ?? null`）→ 审计。
- `ingestFeedback`：幂等改 `prisma.feedback.findFirst({ where: { source: channel, externalRefId } })` → 409（`existingFeedbackId` details 保留）。
- `updateFeedback`：findUnique → 状态机校验 → update data（`resolvedAt/verifiedAt: new Date()`）→ 审计 `{from, to}`。

测试重写（`beforeEach: _resetDb + seedAgent`；不再 useTempDataDir）：
- create：缺 agent 404、NEW 状态 + submittedBy "system"、响应含 agent 摘要。
- 状态机 8 例：NEW→TRIAGED、NEW→RESOLVED 拒、全链路到 CLOSED（含 resolvedAt/verifiedAt 断言）、CLOSED/WONTFIX 终态、同状态只改 severity、RESOLVED→IN_PROGRESS 重开、缺单 404。
- 审计：`await flushAudit(); listAudit({action:"feedback.create"})` 有记录。
- ingest 的响应/幂等断言在 Task 3 的集成测试覆盖。

```bash
git commit -m "feat(web): feedback-service 迁移 Prisma——状态机保留，externalRef 平铺列重组，列表 tag 过滤走数组 has" -- apps/web/lib/services/feedback-service.ts apps/web/lib/__tests__/feedback-service.test.ts
```

---

## Task 3: 并行会话两个 feedback 集成测试 PG 适配（D8 授权补丁）

**Files:**
- Modify: `apps/web/app/api/__tests__/feedback-ingest.test.ts`
- Modify: `apps/web/app/api/__tests__/feedback-skills-wiki.test.ts`

- `writeAgent(id)`：`store.write(...)` → `prisma.agent.create`（name `助手-${id}`、productGroup 先建 `pg-ingest`）。
- 409 幂等断言：`store.list("feedback")` → `prisma.feedback.findFirst({ where: { externalRefId: "DUP-1" } })`。
- feedback-skills-wiki：`beforeEach` 加 `await _resetDb()` + seed agent（feedback POST 需 agent 在 PG）；审计 JSON 镜像断言保留不动（镜像仍在双写）。

```bash
git commit -m "test(web): feedback ingest/集成测试适配 PG 事实源——建档与幂等断言改 Prisma（并行会话文件授权补丁）" -- apps/web/app/api/__tests__/feedback-ingest.test.ts apps/web/app/api/__tests__/feedback-skills-wiki.test.ts
```

---

## Task 4: skill-service 重写 + unbind 审计署名修复

**Files:**
- Rewrite: `apps/web/lib/services/skill-service.ts`
- Modify: `apps/web/app/api/agents/[id]/skills/route.ts`（DELETE 补 `withActor`，修 skill stub 坑7：解绑审计恒署名"系统"）
- Rewrite: `apps/web/lib/__tests__/skill-service.test.ts`
- Create: `apps/web/app/api/__tests__/agent-skills.test.ts`

服务要点：
- `listSkills`：category/status 跳 "ALL"；search → `OR: [name/displayName/description contains insensitive]`；`orderBy: [{ updatedAt: "desc" }]` + count；items 经 `toSkillResponse`（include `_count: {select:{bindings,versions}}`）。
- `getSkill`：include `bindings`（含 `agent select id,name` + `skill select id,name,displayName`）与 `versions`（publishedAt desc take 10）+ `_count`；binding 映射 `boundAt→createdAt`（D7）。
- `createSkill`：重名预检 → 409（D6）；audit skill.create。
- `updateSkill`：findUnique→404；zod 白名单字段直传；audit。
- `deleteSkill`：status ARCHIVED；audit skill.archive。
- `bindSkill`：`upsert({ where: { agentId_skillId }, update: { enabled: true, ...(config !== undefined && { config }) }, create: { agentId, skillId, config: config ?? null, enabled: true, priority: 0, boundBy: getActor().id } })`；幂等语义与旧实现一致；audit skill.bind。
- `unbindSkill`：agent 404 校验保留；`deleteMany` 不看命中数，恒 `{ deleted: true }`（旧契约静默成功）；audit skill.unbind。
- `getAgentSkillBindings`：agent 缺失返回 `[]`；priority desc。
- `toggleSkillBinding`：绑定缺失 404；无审计（旧契约，stub 坑1 原样保留）。

测试：重名 409、defaults、审计（flushAudit+listAudit）、getSkill 聚合（bindings 含 agent+skill 摘要、versions 空数组、_count 真实值）、update/archive、bind→再 bind 幂等→unbind、toggle 缺绑定 404、listSkills 过滤。路由测试断言 unbind 审计署名 = 请求头 actor 名（非"系统"）。

```bash
git commit -m "feat(web): skill-service 迁移 Prisma——bind 幂等 upsert、binding 实时摘要；agents/[id]/skills 解绑补 withActor 修审计署名" -- apps/web/lib/services/skill-service.ts apps/web/app/api/agents/[id]/skills/route.ts apps/web/lib/__tests__/skill-service.test.ts apps/web/app/api/__tests__/agent-skills.test.ts
```

---

## Task 5: wiki-service 重写

**Files:**
- Rewrite: `apps/web/lib/services/wiki-service.ts`
- Rewrite: `apps/web/lib/__tests__/wiki-service.test.ts`

服务要点：
- 全部 fs 硬编码路径删除（stub 坑1/坑2 消失）。
- `listVaults`：agentId / `isShared` 过滤 + updatedAt desc + count；include `_count {pages, ingestJobs}` + `agent select id,name`；响应保持 `_count` 与 `agent` 键。
- `createVault`：默认值（gitBranch main、统计 0）靠 schema 默认 + 显式传 `pageCount: 0` 等；`gitRepoUrl: data.gitRepoUrl || null`；不再 ensureDir。
- `deleteVault`：`prisma.wikiVault.delete`（级联删页面/任务，KnowledgeConfig 置空，D4）。
- `listPages`：findMany where `vaultId` + lifecycle/tier 跳 "ALL" + `tags: { has: tag }` + search `OR contains`（title/content）+ updatedAt desc + count；页面映射 `sourceRefs: row.sourceRefs ?? []`，`inboundLinks/outboundLinks` 恒 `[]`（运行时从未写入，旧契约是空数组；schema 计数列保留）。
- `getPage`：`findUnique include vault select id,name`（跨库全扫消失，stub 坑3 消失）→ 映射 + `vault` 快照。
- `createPage`：vault 404 → slug 重复预检 409（D6）→ create（默认 provenance EXTRACTED / lifecycle DRAFT / tier SPECIALIZED / baseConfidence 0.5 / filePath `${slug}.md`）→ 审计。
- `updatePage`：findUnique→404；zod 字段更新；audit `{vaultId, title}`。
- `deletePage`：findUnique→404；delete；audit；`{deleted:true}`。

测试：vault CRUD（含 deleteVault 连页删级联验证、listVaults agentId/shared 过滤、审计）、page CRUD（404/409/默认值/update/delete/getPage vault 快照）、listPages 过滤分页（种子 VERIFIED 页面、lifecycle ALL 豁免、ghost vault 空集）。

```bash
git commit -m "feat(web): wiki-service 迁移 Prisma——去 fs 硬编码路径，vault 级联删除，getPage 直达 include；slug 重复 409" -- apps/web/lib/services/wiki-service.ts apps/web/lib/__tests__/wiki-service.test.ts
```

---

## Task 6: retrieval-service 换数据源

**Files:**
- Modify: `apps/web/lib/services/retrieval-service.ts`（只改 loadPages 与 import；`tokenize`/`tfSat`/`countToken`/`scorePage`/`searchWiki` 算法零改动）
- Rewrite: `apps/web/lib/__tests__/retrieval-service.test.ts`

```ts
// loadPages 改为：
async function loadPages(vaultId: string): Promise<WikiPage[]> {
  const rows = await prisma.wikiPage.findMany({
    where: { vaultId },
    select: { id: true, title: true, slug: true, summary: true, content: true, tags: true, baseConfidence: true },
  });
  return rows.map((r) => ({ ...r, tags: [...r.tags] }));
}
```
`_getDataDir` 未用 import 与 fs 依赖消失（stub 坑2）。测试：`beforeEach _resetDb`，页面经 `prisma.wikiPage.createMany` 种子（sourceRefs 必填传 `[]`、filePath 必填）；9 个断言用例与旧版一致（空入参/排序/threshold 降级/无 content 容错/不存在 vault/maxResults/excerpt≤400/usedInContext）。

```bash
git commit -m "feat(web): retrieval-service 数据源切 Prisma——BM25-lite 算法不动，去 fs 与未用 _getDataDir" -- apps/web/lib/services/retrieval-service.ts apps/web/lib/__tests__/retrieval-service.test.ts
```

---

## Task 7: 终验 + 终审记录

- [ ] `pnpm vitest run` 全绿（预期 32+ 文件；批1 基线 315 例）
- [ ] `pnpm lint` 通过
- [ ] `pnpm build` 通过
- [ ] 双写共存抽查：agents.test.ts（JSON 审计断言）与 settings-roles.test.ts（PG）同绿
- [ ] 计划文档追加终审记录；pathspec 提交

## 验收标准

1. 四个 service 的 `store.*` / fs 依赖全部消失（`grep -l "@/lib/data/store" apps/web/lib/services/` 只剩 audit-service 的镜像写入与 agent/release 等未迁移服务）。
2. 路由公开契约不变；新增语义仅：skill 重名/同库 slug 重复 409（D6）、unbind 审计署名修复。
3. 四服务及其测试的审计断言全部走 `flushAudit + listAudit`（PG）；JSON 镜像消费者集合较批1 缩小。
4. 全量测试无新增失败；lint / build 通过；迁移可对存量库幂等 deploy。

## 批次衔接

- 批3（agent-service）：consumers 里最重的 store 用户（双写留痕、四分区、`_count.skillBindings` 写 agent 文件等语义全部 PG 化）。
- 批4（release 链 + trace/eval-case/ai-review）：含批0 裁决②（Trace/EvalCase→Agent 外键 RESTRICT vs 运行时无约束）。
- 批5：删 JSON 镜像与 store.ts、`db:seed`、coverage include 收口、文档同步。

---

## 终审记录（2026-09-11 回写）

### 结果

| 项 | 结果 |
| --- | --- |
| 全量测试 | **33 文件 / 331 例全绿**（批1 基线 315 → 新增 16：skill 路由 3、wiki 扩充、retrieval 9） |
| lint / build | 双通过（build 首跑暴露 3 处类型错误，已修复，见下） |
| 迁移部署 | 20260911173000_feedback_wiki_runtime_align 已 deploy 至 dev 库并验证 |
| store/fs 残留 | 四服务 0 残留；剩余使用者即批3/4/5 对象（agent、release、trace、eval-case、ai-review、version-lineage、maas-usage、effectiveness、evidence-chain）+ audit-service 镜像 |

### 提交清单（7 commit）

| commit | 内容 |
| --- | --- |
| `1788d55` | T1 schema 漂移对齐 + 手写迁移（D1–D5） |
| `0b32bef` | T2 feedback-service 重写 + 测试 + seedAgent 公共夹具 |
| `01d2d6b` | T3 并行会话两文件 PG 适配（D8 授权） |
| `9a821f0` | T4 skill-service 重写 + unbind 补 withActor + 路由测试 |
| `eed4ede` | T5 wiki-service 重写（级联删、slug 409、契约保形） |
| `1863d9c` | T6 retrieval-service 换 PG 数据源 |
| `2abce2f` / `262a954` | T7 终验期补丁（见"执行期修复"） |

### 执行期修复（计划外，已回写）

1. **D8 授权范围外第三文件**：`llm-integrations.test.ts` 反馈洞察用例因 feedback 迁移而破（store.write JSON 建档 → getFeedback 走 PG 404）。按同一原则最小补丁：describe 级 `beforeEach` 建 PG 档（productGroup/agent/feedback），断言结构不动。**已披露**，超出 D8 字面范围由用户追认。
2. **构建期类型收口（262a954）**：`tags: { has }` 与 create/ingest 的 tags 需 `as FeedbackTag` cast；retrieval 本地 WikiPage 接口对齐 Prisma select 非空类型（`summary: string | null`）；wiki 的 `VAULT_INCLUDE` 合并常量（原 payload 类型漏 agent include，顺带修了声明顺序）。
3. **测试适配细节**：WikiPage `(vaultId, slug)` 唯一约束要求种子逐页给 slug（默认取 id）；`productGroup.displayName`、`feedback.submittedBy` 为必填；agent-skills 路由 GET 需显式传 route context。

### 行为变化（相对批1 基线）

- 新增 409 语义（D6）：skill 重名、同库 slug 重复——原先依赖 DB 兜底/静默。
- `agents/[id]/skills` DELETE 解绑审计署名从恒"系统"修为真实 actor（skill stub 坑7 回归测试覆盖）。
- binding 响应的 skill 摘要改为 include 实时取（修复旧 JSON 快照陈旧坑，stub 坑4）。
- `deleteVault` 级联删 pages/ingestJobs（PG ON DELETE CASCADE 对齐旧 fs 递归删目录）。
- skill 重绑（upsert）在未传 config 时保留旧 config，传了则覆盖并重新启用——与旧"再 bind = 更新"一致但更精确。
- 全部 331 例 PG 依赖 `_resetDb` + worker 独立库（批1 基建延续），CI PostgreSQL 容器已就绪。
