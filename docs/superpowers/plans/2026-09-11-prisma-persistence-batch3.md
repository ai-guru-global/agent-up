# 批3：agent-service 迁移 Prisma——实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** agent-service（store 最大用户：主资源 CRUD + 四分区配置 + config-changes 留痕）整体切到 Prisma，并重指向两个因数据源切换而功能受损的依赖路由（chat、eval-cases）。

**Architecture:** 沿用批1/批2 契约保形模式——service 公开签名与响应形状不变（mapper 保形 + 真实 `_count`），路由零改动（chat/eval-cases 除外，属数据源重指向）；config-changes 走 PG 单写（无镜像，无读者）。

**Tech Stack:** Prisma + PostgreSQL（packages/db）、Vitest PG 测试基建（`_resetDb` + `seedAgent`）。

---

## 决策（D1–D9）

| # | 决策 | 理由 |
| --- | --- | --- |
| D1 | `ConfigChange.partition` 枚举 → `String` | 回滚路由写入 `PROMPT_ROLLBACK` 等带后缀值（versions-rollback.test.ts:98 断言 includes("ROLLBACK")），枚举装不下；与批2 D1（Feedback.source）同一原则。`ConfigPartition` 枚举保留给 `Release.changedPartitions` |
| D2 | 四分区配置用 schema 既有 typed 列（PromptConfig 等 4 表），**不改 schema** | zod 分区 schema 字段与模型列一一对应（已核对）；不引入 JSON 列退化 |
| D3 | 分区更新 = Prisma upsert：create `version: 1`，update `{ version: { increment: 1 }, ...fields, lastModifiedAt, lastModifiedBy: actor.id }` | 对齐旧 `{...existing, ...data, version+1}` 合并语义（未传字段保留）；Int 列顺带消灭「version 非数字从 0 起算」脏数据坑；lastModifiedBy 落库但响应不回（旧契约无此键） |
| D4 | 分区响应 mapper = zod 字段 + `version` + `lastModifiedAt`(ISO)；剥离 id/agentId/lastModifiedBy/syncStatus/lastSyncAt | 旧 JSON 分区形状即「PUT 过的字段 + version + lastModifiedAt」；模型行的内部列不外泄。Tools/Routing 的 Json 列 create 时补 `?? []` / `?? null` 默认（旧行为是键缺失，响应多一个空数组键，可接受偏差） |
| D5 | `withProductGroup` → include `productGroup select {id,name,displayName}`，mapper 兜底 `?? null` | 消灭「逐行重读 product-groups.json」性能坑（stub 坑2）；productGroupId 是必填 FK，PG 下恒有解 |
| D6 | `_count` 真实计数 `{feedbacks, releases, versions, skillBindings}` | UI agents/page.tsx:30 与 agent-detail.tsx:34 读这四个键；批1 D6 哲学（旧 JSON 静态计数早已失真） |
| D7 | `getAgent` 聚合：include 四分区 + productGroup + skillBindings(含 skill 摘要) + `_count`；releases = PENDING（submittedAt desc + id desc）全字段 ISO 化；versions = publishedAt desc take 5（stub 坑4 原样保留） | 契约保形：`releases`/`versions` 键照旧；versions 截 5 是有记录的行为，不趁机改 |
| D8 | **agent JSON 停止作为事实源后，两个读 agent 文件且会功能受损的路由重指向 prisma**：chat（agent.promptConfig → 试聊核心流）、eval-cases（agent 存在性校验 → 否则新 agent 误 404）。releases 路由的 agent 名字查询与 dashboard 统计只降级显示（JSON 种子仍在），推迟批4/批5 | 功能断 vs 显示降级分开处置；releases 全链批4 整体迁移，避免混源 churn |
| D9 | `recordConfigChange` 写 `prisma.configChange.create`，无 JSON 镜像 | config-changes 无运行时读者（grep 证实只有测试读）；审计仍由 recordAudit 双写负责。响应键 `createdAt` ← `changedAt` ISO 映射 |

**数据库迁移（T1）**：

```sql
-- 20260911xxxxxx_configchange_partition_text/migration.sql
ALTER TABLE "ConfigChange" ALTER COLUMN "partition" TYPE TEXT USING "partition"::text;
```

schema.prisma：`ConfigChange.partition ConfigPartition` → `partition String`（加注释说明 D1）。

**批3 影响面（全部列名）：**

- Rewrite：`apps/web/lib/services/agent-service.ts`
- Rewrite：`apps/web/lib/__tests__/agent-service.test.ts`
- Rewrite：`apps/web/app/api/__tests__/agents.test.ts`
- Modify：`apps/web/app/api/agents/[id]/chat/route.ts`（store.read agents → prisma.agent.findUnique include promptConfig）
- Modify：`apps/web/app/api/agents/[id]/eval-cases/route.ts`（两处 agent 存在性校验 → prisma）
- Modify（D8 授权延续 + 本批 D8）：`apps/web/app/api/__tests__/llm-integrations.test.ts`（chat describe 建 PG 档）、`apps/web/app/api/__tests__/trace-eval-ai-review.test.ts`（agent 种子 PG 化）、`apps/web/app/api/__tests__/versions-rollback.test.ts`（beforeEach PG agent + config-changes 断言 PG 化；version 夹具保持 JSON——versions 路由与回滚查版本仍属批4）
- Create：`packages/db/prisma/migrations/<ts>_configchange_partition_text/migration.sql`

**批4/批5 遗留清单（本批不动，防误判为回归）：**

- releases 三路由与 dashboard 路由的 store 读取（显示降级，批4/批5 迁移）。
- 分区回滚路由的 `store.read("versions")`（批4 随 release-service 一起切 PG；其 config 更新与留痕本批已 PG 化，夹具保持 JSON 自洽）。
- agent-service.test 的 versions 夹具若需 PG 版本行，须先建 Release 行（AgentVersion.releaseId 必填 FK @unique）。

---

## Task 1: ConfigChange.partition 枚举放宽 + 迁移部署

**Files:**
- Modify: `packages/db/prisma/schema.prisma`（ConfigChange.partition → String + 注释）
- Create: `packages/db/prisma/migrations/20260912090000_configchange_partition_text/migration.sql`

- [ ] schema 修改 + 手写迁移 SQL（见上）
- [ ] `pnpm --filter @agent-up/db exec prisma migrate deploy && prisma generate`（dev 库部署 + client 再生成）
- [ ] 验证：psql `\d "ConfigChange"` partition 列为 text

- [ ] **Commit（pathspec）**：`feat(db): ConfigChange.partition 放宽为文本列——回滚留痕带 _ROLLBACK 后缀，枚举装不下`

## Task 2: agent-service 重写 + service 测试重写

**Files:**
- Rewrite: `apps/web/lib/services/agent-service.ts`
- Rewrite: `apps/web/lib/__tests__/agent-service.test.ts`

服务要点（签名全部不变）：

```ts
// mapper 骨架
const AGENT_INCLUDE = {
  productGroup: { select: { id: true, name: true, displayName: true } },
  _count: { select: { feedbacks: true, releases: true, versions: true, skillBindings: true } },
  skillBindings: { include: { skill: { select: { id: true, name: true, displayName: true } } } },
  promptConfig: true, knowledgeConfig: true, toolsConfig: true, routingConfig: true,
} as const;

function toAgentResponse(row) {
  return {
    id, name, description, productGroupId, status, createdBy,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    productGroup: row.productGroup ? {...row.productGroup} : null,
    promptConfig: row.promptConfig && toPromptConfigResponse(row.promptConfig),
    knowledgeConfig: row.knowledgeConfig && toKnowledgeConfigResponse(row.knowledgeConfig),
    toolsConfig: row.toolsConfig && toToolsConfigResponse(row.toolsConfig),
    routingConfig: row.routingConfig && toRoutingConfigResponse(row.routingConfig),
    skillBindings: row.skillBindings.map(toBindingShape),
    _count: {...row._count},
  };
}
// toPromptConfigResponse: {systemPrompt, roleDefinition, constraints:[...], outputFormat, version, lastModifiedAt ISO}
// toKnowledgeConfigResponse: {wikiVaultId, searchStrategy, fallbackToMcp, maxWikiResults, confidenceThreshold, version, lastModifiedAt ISO}
// toToolsConfigResponse: {mcpTools, wikiQueryTools, maxConcurrentCalls, timeoutMs, retryCount, version, lastModifiedAt ISO}
// toRoutingConfigResponse: {rules, escalationPolicy, humanThreshold, maxConversationTurns, idleTimeoutMinutes, version, lastModifiedAt ISO}
// toBindingShape: {id, agentId, skillId, config, enabled, priority, boundBy, createdAt: boundAt ISO, skill}
```

- `listAgents`：where status(跳 ALL)/productGroupId/search（name+description contains insensitive）；`orderBy [{updatedAt desc},{id desc}]`；include `AGENT_INCLUDE` **但 list mapper 不含 skillBindings 键**（旧种子文件本无此键，契约保形）；findMany+count Promise.all。
- `getAgent`：findUnique include AGENT_INCLUDE → null 早退；再 `prisma.release.findMany({ where: { agentId, status: "PENDING" }, orderBy: [{submittedAt desc},{id desc}] })` 全字段 ISO 化；`prisma.agentVersion.findMany({ where: { agentId }, orderBy: [{publishedAt desc},{id desc}], take: 5 })` 映射（publishedAt ISO，四 snapshot 原样）。返回 `{...toAgentResponse(row), releases, versions}`。
- `createAgent`：`prisma.productGroup.findUnique` 校验 → NotFoundError(`产品组 ${id} 不存在`)；create `{name, description ?? null, productGroupId, createdBy: getActor().id}` include AGENT_INCLUDE；audit `agent.create`；响应含 `_count` 全 0、`skillBindings: []`、四分区 null（旧 createAgent 契约）。
- `updateAgent`：findUnique→404 `Agent ${id} 不存在`；update 仅 name/description/status 提供键；include AGENT_INCLUDE；audit `agent.update` details=input。
- `deleteAgent`：findUnique→404；update status ARCHIVED；audit `agent.archive`；返回 mapper（旧契约返回整 agent，非 {deleted:true}）。
- `getAgentConfig`：findUnique include 对应分区（四次映射按 partition 分支）→ 无 agent 404；分区行缺失返回 null。
- `updatePromptConfig` 等四薄封装 → `updateConfigPartition(agentId, partition, data)`：

```ts
async function updateConfigPartition(agentId, partition, data) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { id: true } });
  if (!agent) throw new NotFoundError(`Agent ${agentId} 不存在`);
  const actor = getActor();
  const now = new Date();
  // 每分区：upsert create/version 1 + update increment 1；字段映射按 D4 列名
  // prompt: systemPrompt/roleDefinition/constraints/outputFormat
  // knowledge: wikiVaultId/searchStrategy(as SearchStrategy)/fallbackToMcp/maxWikiResults/confidenceThreshold
  // tools: mcpTools ?? [] / wikiQueryTools ?? [] / maxConcurrentCalls/timeoutMs/retryCount
  // routing: rules ?? [] / escalationPolicy ?? null / humanThreshold/maxConversationTurns/idleTimeoutMinutes
  // 公共: version: create=1 | update={increment:1}, lastModifiedAt: now, lastModifiedBy: actor.id
  // update 的字段 spread 仅含 data 提供的键（undefined 检查）
  return to<Partition>ConfigResponse(row);
}
```

- `recordConfigChange`：`prisma.configChange.create({ data: { agentId, partition, before: (before ?? Prisma.JsonNull) as never, after: after as never, diff: diff as never, changedBy: actor.id, changeNote: changeNote ?? null } })`；audit `agent.config.update` details={partition, changeNote, diffSummary}（键名摘要，决策4 原样）；返回 `{id, agentId, partition, before, after, diff, changedBy, changeNote, createdAt: changedAt.toISOString()}`。`computeJsonDiff` 原样保留。

测试（`_resetDb` + `seedAgent`；分区行经 `updatePromptConfig` 造）：
- getAgentConfig：无分区返回 null、404；update 后返回 systemPrompt + version。
- version 递增：首次 PUT version 1，再次 2（取代旧 `beforeVersion+1` 断言）。
- updateAgent 更新 updatedAt；recordConfigChange：diff added/changed/removed + changedBy + changeNote；持久化经 `prisma.configChange.count`。
- getAgent：null；releases/versions 数组 + PENDING 过滤 + versions 截 5（种 6 条 version 行验证 take 5，version 行先造 Release 行）。
- createAgent：缺产品组 404、成功（_count 全 0、productGroup 摘要）。
- updateAgent/deleteAgent 404 + 归档。

- [ ] 实现服务；[ ] 重写测试；[ ] `pnpm vitest run lib/__tests__/agent-service.test.ts` 绿
- [ ] **Commit（pathspec）**：`feat(web): agent-service 迁移 Prisma——四分区 upsert 版本自增、config-changes 落 PG、withProductGroup include 化`

## Task 3: agents 路由测试重写（PG）

**Files:**
- Rewrite: `apps/web/app/api/__tests__/agents.test.ts`

- beforeEach：`_resetDb` + 建 `ecs-group`（displayName 必填）+ 两个 agent（DRAFT/ACTIVE 各一，经 prisma.agent.create 带 createdBy）。
- 断言迁移：审计 `store.readArray(audit-logs)` → `flushAudit + listAudit({action, resourceId})`；config-change `store.list(config-changes)` → `prisma.configChange.findFirst({ where: { agentId } })`；其余结构照旧（分页/过滤/404/422/PUT version>0/GET 配置）。
- [ ] 重写并 `pnpm vitest run app/api/__tests__/agents.test.ts` 绿
- [ ] **Commit（pathspec）**：`test(web): agents 路由测试切 PG 事实源——审计/留痕断言走 flushAudit+listAudit 与 prisma`

## Task 4: 依赖路由重指向 + 跨文件测试补丁（D8）

**Files:**
- Modify: `apps/web/app/api/agents/[id]/chat/route.ts`
- Modify: `apps/web/app/api/agents/[id]/eval-cases/route.ts`
- Modify: `apps/web/app/api/__tests__/llm-integrations.test.ts`（仅 chat describe）
- Modify: `apps/web/app/api/__tests__/trace-eval-ai-review.test.ts`（仅 agent 种子）
- Modify: `apps/web/app/api/__tests__/versions-rollback.test.ts`（仅 beforeEach + config-changes 断言）

- chat 路由：`store.read(agents)` → `prisma.agent.findUnique({ where: { id }, include: { promptConfig: true } })`；`buildSystemPrompt` 入参由 promptConfig 行直接映射（systemPrompt/roleDefinition/constraints/outputFormat 缺省兜底 `{}`）。404 文案不变。
- eval-cases 路由：两处 `store.read("agents", ...)` → `prisma.agent.findUnique({ where: { id }, select: { id: true } })`，404 语义不变。
- llm-integrations chat describe：beforeEach 建 PG 档（productGroup→agent→promptConfig 行 systemPrompt="你是 ECS 助手"、constraints=["不回答无关问题"]），断言不动。
- trace-eval-ai-review.test.ts：store.write agent 种子处加 PG 建档（agent + promptConfig），JSON 夹具保留（trace/eval 路由仍读 JSON）。
- versions-rollback.test.ts：beforeEach `useTempDataDir` 后加 `_resetDb + seedAgent(AGENT_ID)`（回滚经 PG 分区更新）；`store.list(config-changes)` 断言改 `prisma.configChange.findFirst({ where: { agentId, partition: { contains: "ROLLBACK" } } })`；version 夹具与审计镜像断言不动。
- [ ] 跑上述三个测试文件 + `pnpm vitest run` 全绿
- [ ] **Commit（pathspec）**：`fix(web): chat/eval-cases 路由 agent 读取切 Prisma（新 agent 可聊可评）；相关测试 PG 适配`

## Task 5: 终验 + 终审记录

- [ ] `pnpm vitest run` 全绿；`pnpm lint`；`pnpm build`
- [ ] 残留核查：`grep -rl "lib/data/store" apps/web/lib/services/` 只剩批4/批5 对象（release、trace、eval-case、ai-review、version-lineage、maas-usage、effectiveness、evidence-chain、audit 镜像）
- [ ] 本文档追加终审记录；pathspec 提交
- [ ] **Commit（pathspec）**：`docs(plans): 批3 计划与终审记录回写`

## 验收标准

1. `agent-service.ts` 无 store/fs import；四分区读写、config-changes、主资源 CRUD 全走 prisma。
2. 路由公开契约不变；行为变化仅：version 恒为干净递增 Int（脏数据坑消失）、lastModifiedBy 落库不回显、`withProductGroup` 性能坑消失、chat/eval-cases 对 PG 新 agent 可用。
3. 全量测试无新增失败；lint/build 通过；迁移幂等可部署。
4. 批4/批5 遗留清单（上文）明确，不把显示降级误判为回归。

---

## 终审记录（2026-09-12 回写）

### 结果

- **迁移**：`20260912090000_configchange_partition_text` 已部署 dev 库，psql 确认 `ConfigChange.partition` 为 `text`；`ConfigPartition` 枚举保留给 `SkillBinding.targetPartition` 与 `Release.changedPartitions`。
- **测试**：`pnpm vitest run` 33 文件 **347/347 全绿**（批2 收官为 331，新增 16）；`pnpm lint` 通过；`pnpm build` 通过。
- **残留核查**：`apps/web/lib/services/` 剩余 store 使用者恰为批4/批5 对象：release、trace、eval-case、ai-review、version-lineage、effectiveness、evidence-chain、maas-usage、audit（JSON 镜像）。chat / eval-cases 路由 store 引用清零。

### 提交清单（6 个，全部 pathspec）

| commit | 内容 |
| --- | --- |
| 72e64d5 | T1 schema+迁移：partition 枚举→text |
| ec4e868 | T2 agent-service 重写 + 服务测试重写（24 测试） |
| 878c2d4 | T3 agents 路由测试 PG 化（13 测试） |
| 7943087 | T4 chat/eval-cases 重指向 prisma + 三个测试文件修补 |
| a812a75 | **批3 影响面补漏**：整版回滚 createRollbackRelease 分区覆盖切 agent-service upsert |
| 963f7d9 | build 修复：config-change Json 入参经 unknown 显式转换 |

### 执行期补漏与修正（教训）

1. **影响面漏判：整版回滚路由**。计划只列了 `config/[partition]/rollback`，漏了 `rollback/[versionId]`（整版回滚）——它委托 `release-service.createRollbackRelease`，其第 1 步直接 store.write 覆盖 JSON 分区。getConfig 切 PG 后测试立即暴露（断言拿到 null）。修复：createRollbackRelease 第 1 步改调 agent-service 四个 update 函数（PG upsert），release/version JSON 落盘与版本 JSON 查找仍留批4。**批4 注意：release-service 现已依赖 agent-service 的 update 函数，迁移 release-service 时这层依赖要整体重写，不能简单替换 store 调用。**
2. **FK 违例：JSON 快照引用 JSON 时代的 wikiVaultId**。ver-001 的 knowledgeSnapshot 带 `wikiVaultId: "ecs-wiki"`，PG 无对应 vault 行 → updateKnowledgeConfig P2003 → 回滚 500。两个回滚测试的 beforeEach 都补种了 `prisma.wikiVault.create({id: "ecs-wiki"})`。这是 JSON→PG 过渡期的必然现象：快照里的外键指向 JSON 时代实体，批4 版本表迁移后此缝自然消失；生产语义上 FK 拒绝悬空引用是期望行为。
3. **listAudit 返回形状**：直接返回 `AuditLogEntry[]`（非 {items}）——写测试时按批2 记忆写错了两处，跑挂后修正。
4. **DiffResult → Prisma.InputJsonValue**：缺索引签名，TS 拒绝直接断言，经 `as unknown` 转换（build 期暴露，vitest 不查）。

### 行为变化（相对批2，全部有意）

- 分区 version 恒为干净递增 Int；`Number(existing.version)||0` 脏数据坑消失。
- `lastModifiedBy` 落库不回显；分区响应 mapper 含模型默认值字段（如未 PUT 过的 `constraints: []`），旧 JSON 时代是「PUT 过才有的键」——消费端均按字段读取，无破坏。
- config-changes 落 PG 单写（无 JSON 镜像）；`partition` 允许 `_ROLLBACK` 后缀值。
- 整版回滚不再回写 JSON agent 文件（分区事实源已 PG）；release/version JSON 照旧。
- chat/eval-cases 对 PG 建档的新 agent 可用（批3 前只能聊 JSON 种子 agent）。
- 列表/详情 `_count` 为真实计数；`withProductGroup` 从逐行重读 JSON 变为 include。
