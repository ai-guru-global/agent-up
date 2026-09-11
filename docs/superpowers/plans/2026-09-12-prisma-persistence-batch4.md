# 批4：发布主线 + 洞察链路迁移 Prisma（store 残余清零，dashboard 除外）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把剩余 8 个服务（trace / eval-case / release / ai-review / version-lineage / effectiveness / evidence-chain / maas-usage）与消费它们的全部路由切到 PostgreSQL，除 dashboard 外 store 在服务层清零。

**Architecture:** 沿用批1–3 的 strangler 模式：公共签名与 REST 响应形状不变，内部 store.* 全量替换为 prisma.*；recordAudit 保持「PG 事实源 + JSON 镜像」（镜像批5 拆除）。release-service 与 ai-review-service 必须同批迁移——ai-review 读 release JSON，拆开必断。

**Tech Stack:** Prisma + PostgreSQL（@agent-up/db），Next.js 16 App Router，vitest。

---

## 背景与依赖图

批3 结束后仍在用 store 的服务与其耦合关系：

- **trace-service** 是底座：eval-case（getTrace 校验）、ai-review（无）、evidence-chain（traces 列表）、maas-usage（traces 列表）都依赖它。
- **release-service** 与 **ai-review-service** 互相咬合（ai-review 读 release + 写 release.aiReview）。
- **effectiveness / version-lineage** 都读 versions；effectiveness 还读 feedback（PG 批2 起）并写 version.effectivenessReport。
- **evidence-chain** 五源聚合：feedback / traces / eval-cases / releases / versions / audit-logs——审计读源必须从 JSON 镜像切到 `prisma.auditLog`（批2 起 PG 为事实源，JSON 镜像只剩旁路副本）。
- **maas-usage** 读 traces + agents。

结论：批4 必须一次吃下全部 8 个服务。批3 的教训（chat 路由漏改导致 500）在这里同样适用——部分迁移 = 功能断裂。

## 决策记录

- **D1（范围）**：8 个服务全量迁移；dashboard 路由与 audit JSON 镜像留给批5。
- **D2（FK 裁决 ②）**：Trace/EvalCase → Agent 保留 schema 里的 FK 关系（默认 RESTRICT），不加迁移。理由：deleteAgent 只软归档（status=ARCHIVED），从不物理删除；所有写入方（chat、eval-cases 路由）已先在 PG 校验 agent 存在。
- **D3（Release 回滚三列）**：JSON 时代的 `isRollback / rollbackFromVersion / rollbackToVersionId` 是动态键，Prisma Release 模型没有对应列。新增列 + migration：`isRollback Boolean @default(false)`、`rollbackFromVersion String?`、`rollbackToVersionId String?`。响应里仍按 JSON 契约**条件键**输出（isRollback=false 时不出现该键组）。
- **D4（id 生成）**：新建 Release/AgentVersion/Trace/EvalCase 不再调用 `store.generateId()`（randomUUID），交给 Prisma `@default(cuid())`。测试只断言 truthy/唯一性，不受影响。
- **D5（diff 语义保真）**：submitRelease 的 before/after 均为「含 version/lastModifiedAt 元数据键的完整 config payload」（JSON 时代即如此：改配置必然 bump lastModifiedAt → 分区计为变更）；快照按此 payload 原样入库；分区回滚与 lineage 继续剥离这两个元数据键。
- **D6（响应形状保真）**：agent-service 的 `toReleaseResponse` 扩展 `version`（嵌入 {id, version, publishedAt} 或 null）与条件回滚键组——这同时修复批3 遗留的保真缺口（JSON 时代 release 对象带 `version: null` 键）。`reviewRelease` 响应**不带** agent 键（JSON 时代如此），`submitRelease/listReleases/rollback` 带 agent join。
- **D7（时间与类型）**：`store.now()` → DateTime 列传 `new Date()`、响应字段 `toISOString()`；Json 列写入统一 `as unknown as Prisma.InputJsonValue`；recordTrace 的 try/catch→null 契约保留。
- **D8（evidence-chain 审计读源）**：从 `store.readArray("settings","audit-logs.json")` 切到 `prisma.auditLog.findMany({where: {resourceId, action: {in: [...]}}})`。
- **D9（maas-usage 聚合口径）**：保持 JS 聚合（数据量小、需 last-model/评分细分），不做 groupBy；唯一行为差异：trace→agent 已有 FK，`agentName` 恒可达（软归档仍在 agents 表），原「agentName=null」分支实际不可达，测试相应调整。
- **D10（跨会话授权 D8 延续）**：受影响测试文件全部在本批重写/修补——这是计划内的最后一批大面积测试改写（批5 只剩 dashboard 一处）。

## 任务分解（依赖序，每任务一提交）

### T1 schema：Release 回滚三列
- packages/db/prisma/schema.prisma：Release 增 `isRollback Boolean @default(false)`、`rollbackFromVersion String?`、`rollbackToVersionId String?`
- `pnpm --filter @agent-up/db exec prisma migrate dev --name release_rollback_columns`；psql 验证列存在

### T2 trace-service → Prisma
- `lib/services/trace-service.ts`：recordTrace（try/catch→null）/getTrace/rateTrace 改 prisma.trace；响应 createdAt/ratedAt ISO
- trace-eval-ai-review.test.ts 的 trace 断言（store.read("traces") → prisma.trace.findUnique）

### T3 eval-case-service → Prisma
- listEvalCases（orderBy createdAt desc, id desc）/createEvalCaseFromTrace（assertions 仅非空时写）/deleteEvalCase（P2025 → NotFoundError）
- 测试走 API 层，无 store 断言，预期零改动

### T4 release 域 → Prisma（最大一坨，含路由）
- release-service：submitRelease/reviewRelease/createRollbackRelease/listReleases/createVersionFromRelease 全 prisma；createVersionFromRelease 改显式参数；withAgentName → include agent
- ai-review-service：release/agent/evalCases 全 prisma；skip/终态写 `prisma.release.update` aiReview
- 路由切 PG：releases 列表、releases/[id]（含 baseline）、releases/[id]/summary、versions 列表、versions/[versionId]、config/[partition]/rollback 版本查找
- agent-service 导出 config mappers / 扩展 toReleaseResponse；getAgent releases findMany 补 include version
- 测试：release-service.test、releases.test 重写；versions-rollback、agent-rollback、trace-eval（release 部分）、llm-integrations（summary 夹具）修补；seed-db 增 seedReleaseWithVersion

### T5 lineage + effectiveness → Prisma
- version-lineage-service：agent + versions（publishedAt asc, id asc）
- effectiveness-service：refetch → prisma.agentVersion；feedback → prisma.feedback.findMany；写回 update；computeEffectivenessReport 纯函数不动（publishedAt 接受 string | Date）
- 测试：version-lineage.test、effectiveness.test 重写

### T6 evidence-chain + maas-usage → Prisma
- evidence-chain：五源全 PG + prisma.auditLog（D8）
- maas-usage：prisma.trace/agent，JS 聚合不变（D9）
- 测试：evidence-chain.test、maas-usage.test 重写

### T7 终检
- 全量 vitest + lint + build；`grep -rn "lib/data/store" apps/web/lib/services apps/web/app/api` 仅剩 dashboard + audit 镜像
- 本计划文档回写终审记录（提交表 + 教训）

## 风险与已知坑（承接批3）

- AgentVersion.releaseId 是**必填** FK：所有 version 夹具必须先建 Release 行（seed-db 助手统一处理）。
- AgentVersion.changeNote 必填：夹具必须带。
- versions-rollback 旧夹具 knowledgeSnapshot 带 wikiVaultId 会触发 FK 违例——本批夹具自控快照内容，不带 wikiVaultId，撤销 vault 前置种子。
- releases.test 门禁夹具的 configSnapshot 内嵌 null 是合法 Json 值，与列级 JsonNull 无关。
- 并行会话并发提交：所有 commit 用 pathspec 形式（`git commit -m ... -- <paths>`）。

## 终审记录（批4 执行完毕，2026-09-11 回写）

### 门禁结果

| 门禁 | 结果 |
| --- | --- |
| `tsc --noEmit`（vitest 不做类型检查） | 通过 |
| 全量 vitest | 33 文件 / 347 测试全绿 |
| eslint | 通过 |
| `next build` | 通过 |
| 服务层 residue grep（`lib/data/store`） | 非测试代码仅剩 audit-service 镜像 + dashboard 路由（均为批5 计划内） |

### 提交表

| 任务 | 提交 | 内容 |
| --- | --- | --- |
| T1 | a0dece2 | Release 回滚三列迁移（isRollback / rollbackFromVersion / rollbackToVersionId） |
| T2+T3 | f9c00da | trace / eval-case 服务与路由切 Prisma（recordTrace 保留 null 兜底契约） |
| T4 | baded5d | release 域整体切 Prisma：release / ai-review / effectiveness 服务 + 6 条路由 + 8 个测试套件 + seedReleaseWithVersion |
| T5 | 4742a3a | version-lineage 切 Prisma（异步化 + payloadOf 收 unknown + 测试夹具走 seed） |
| T6 | e2fe1ec + 2b77aec | evidence-chain / maas-usage 切 Prisma。注意：主体被并行会话的 `update` 提交（e2fe1ec）连带收走（含 audit-logs.json 镜像噪声），2b77aec 只含测试断言适配——内容完整，提交归属被拆分 |

### 执行中的裁决与教训

1. **(agentId, version) 唯一约束**：JSON 时代允许多版本同名字符串，PG 会炸夹具。effectiveness.test 的 seedVersion 增加 semver 参数（old=0.1.0 / new=0.2.0）。
2. **FK 使「悬空引用」不可表达**：JSON 时代 version.releaseId 可指向不存在的文件，PG 下 seed 必建真实 Release 行 → evidence-chain 夹具多出一个 RELEASE 节点（5→6），断言按 id 映射重写并注明原因。
3. **JsonValue 行进宽接口**：effectiveness 的 VersionLike.effectivenessReport 放宽为 unknown，PG 行直接可传，函数内窄化为 EffectivenessReport；纯函数测试不受影响。
4. **fire-and-forget 审计断言**：凡测试内直接 `listAudit()` 前必须 `await flushAudit()`（recordAudit 是 floating promise）。
5. **并行会话扫库提交**：pathspec commit 保护了我的提交不夹带他人文件，但反向不成立——并行会话的 `git add -A` 式提交会把我未提交的 WIP 一并收走。T6 主体因此落在 e2fe1ec。批5 需继续警惕。
6. **D8/D9 落地确认**：evidence-chain 审计源切 `prisma.auditLog`（resourceId 过滤 + details JsonValue 读保护）；maas-usage 保持 JS 聚合，agentName=null 分支保留但注明 FK 下不可达，测试改为断言非空。

### 批5 移交清单（本批核实过的残留）

- `lib/services/audit-service.ts`：JSON 镜像拆除（flushAudit 的 pendingWrites 机制保留）。
- `app/api/dashboard/route.ts`：最后一个读 store 的路由。
- 读/清审计镜像的测试：`feedback-skills-wiki.test.ts:46`（readArray 断言）、`feedback-ingest.test.ts:41`（镜像清空）——批5 需切 prisma.auditLog。
- `app/(dashboard)/architecture/roadmap/page.tsx:244`：内容字符串提及 store 路径（非代码依赖，随 docs sync 一并处理）。
- `db:seed` 全局种子、删除 store.ts / _setDataDir / data/ 目录、README 与蒸馏文档同步。
