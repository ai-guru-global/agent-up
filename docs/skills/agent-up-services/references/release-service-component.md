---
title: release-service 组件蒸馏
source: docs/distilled/release-service.md
source_commit: 7524808330e38b5510c65b690348f59c127559c2
---

# release-service 组件

> 蒸馏自 `docs/distilled/release-service.md`（人工升档 core：发布与回滚是配置生效的唯一命脉）。故障排查读 `references/release-service-troubleshooting.md`。

## 何时读

需要理解或修改发布提交 / 审批 / 整版本回滚流水线、diff 基线、SemVer 升版规则时读本篇。

## 职责

`apps/web/lib/services/release-service.ts` 承载 Agent 配置的发布流水线，四个导出函数各管一段：

- `submitRelease`：把 Agent 当前 4 分区配置（prompt / knowledge / tools / routing）与最近一次已发布 Version 的快照做真实 diff，产出 PENDING 状态的 Release（`apps/web/lib/services/release-service.ts:78`）。
- `reviewRelease`：审批 PENDING Release；仅 APPROVED 派生不可变 Version（`apps/web/lib/services/release-service.ts:138`）。
- `createRollbackRelease`：整版本回滚——把历史快照覆盖回 Agent 当前配置，并立即派生新 Version（`apps/web/lib/services/release-service.ts:255`）。
- `listReleases`：按 agent 与状态列出 Release（`apps/web/lib/services/release-service.ts:343`）。

它不直接修改运行时行为；真正让配置生效的是「审批通过 → 生成 Version → 回滚时把 Version 快照写回 agent 配置」这条链。

## 设计原理

- **提交与审批解耦，快照与版本号分离。** 提交时就把 4 分区配置固化成 configSnapshot（`apps/web/lib/services/release-service.ts:99-105`），审批时才基于「当时的最高版本号」计算新版本号并落 Version（`:191-229`）。Release 状态机：PENDING 出发，到 APPROVED / REJECTED / CHANGES_REQUESTED 三个终态；终态都不可再变，重复审批抛 ConflictError（`:145-147`）；CHANGES_REQUESTED 必须带审批意见（`:148-150`）。
- **diff 基线是「最近已发布 Version」，不是「上一条 Release」。** 基线按 publishedAt 倒序取第一条（`:36-43`）；分区级变更判定用 computeJsonDiff 的 added/removed/changed 三桶非空判断（`:56-68`）。四分区都没有真实变更时拒绝提交（`:95-97`）。
- **版本号语义集中在 versioning 模块。** 首次发布 0.1.0；ROUTING 分区变更或不少于 2 个分区变更升 minor；单个非路由分区升 patch；永不自动 major（`apps/web/lib/versioning.ts:7-13`、`:63-68`）。头注释交代动因：此前 release-service 把 major/patch 硬编码为 0、只递增 minor，无法表达「小修与大改」（`apps/web/lib/versioning.ts:1-6`）。

## 关键决策

| # | 决策 | 动因与证据 |
|---|------|-----------|
| 1 | changedPartitions 走真实 diff，而非「配置存在即算变更」 | 提交函数 docstring 自述「关键修复」（`apps/web/lib/services/release-service.ts:70-77`）；测试固化行为（`apps/web/lib/__tests__/release-service.test.ts:67-92`） |
| 2 | 无变更拒绝提交 | 避免无意义 release（`:95-97`）；测试覆盖 ValidationError（`apps/web/lib/__tests__/release-service.test.ts:30-54`） |
| 3 | configSnapshot 恒写入 | 修复种子数据「快照为 null 却已批准」的矛盾（`:76`、`:99-105`） |
| 4 | 重复审批抛 ConflictError | 此前是含糊的裸 Error，docstring 明确列为修复项（`:129-137`） |
| 5 | CHANGES_REQUESTED 必须带审批意见 | 校验（`:148-150`）+ 测试（`apps/web/lib/__tests__/release-service.test.ts:138-143`） |
| 6 | 最高版本号按三段数值比较 | 代码内注释点明（`:199-202`），手写比较器 compareSemVer（`:231-239`） |
| 7 | 整版本回滚不走 PENDING 审批流 | docstring 取舍：回滚是紧急恢复而非新增变更，直接以 APPROVED 落盘（`:241-254`、`:293-312`）并打 isRollback 标记（`:308-310`） |
| 8 | 回滚立即派生新 Version，保证历史快照不可变 | docstring「版本号自增，确保历史快照不可变」（`:247`、`:314-323`） |

## 暴露接口

| 函数 | 签名要点 | 行为摘要 |
|------|---------|---------|
| `submitRelease(agentId, changeNote)` | 异步 | 校验 agent 存在 → 四分区 diff → 写 PENDING release + configSnapshot → 记审计；返回值附 agent 名称（`:23-26`） |
| `reviewRelease(releaseId, action, reviewComment?)` | action 三选一 | 终态判定 → 意见校验 → APPROVED 时派生 Version 并回填摘要（`:162-169`） |
| `createRollbackRelease(agentId, targetVersionId)` | 异步 | 覆盖 4 分区 → APPROVED release → 派生新 Version → 记审计；返回 release/version/restoredFrom（`:336-340`） |
| `listReleases(agentId, status?)` | 同步语义 | 按 submittedAt 倒序（`:352-353`）；注意已知坑 3 |

## 数据流

提交 → 审批 → 版本落盘的主线：调用方传 agentId 与 changeNote，submitRelease 读 agents 与 versions、四分区 diff 得 changedPartitions、写 PENDING release（含 configSnapshot）、记 release.submit 审计。审批走 reviewRelease：读 release，action 为 APPROVED 时读 versions 取最高版本号、写不可变 Version 快照，最后回写 release 状态与 version 摘要并记审计。回滚的数据流（文字描述）：读目标 Version 并校验归属（`:259-263`）→ 把 4 个分区快照逐个剥离 version/lastModifiedAt 字段后覆盖 agent 当前配置并写回（`:279-291`）→ 构造 APPROVED release → 立即派生新 Version → 落 release 文件 → 记 agent.rollback 审计（`:328-334`）。

## 依赖与调用方

- import 全集（`apps/web/lib/services/release-service.ts:1-11`）：store（唯一持久层）、getActor（写入 submittedBy/publishedBy/approvedBy）、errors 三类（NotFoundError/ValidationError/ConflictError）、recordAudit（唯一横向服务依赖，submit/approve/reject/changes_requested/agent.rollback 五个动作各记一条，`:125`、`:179-182`、`:328-334`）、computeJsonDiff（分区级变更判定）、versioning（bumpVersion/formatVersion/Partition/SemVer）。
- 路由调用方：POST /api/agents/[id]/release（提交，withActor 包裹）、PUT /api/releases/[id]/review（审批权威入口，path 传 id）、PUT /api/agents/[id]/release（向后兼容审批端点，id 取自 body）、POST /api/agents/[id]/rollback/[versionId]（整版本回滚）。

## 已知坑

1. **快照与版本号解耦，乱序审批时时间线错位。** configSnapshot 在提交时固化（`:99-105`），版本号在审批时基于「当时的最高版本」计算（`:199-204`）。两条 PENDING release 乱序审批时，后审批者版本号更大但配置内容是更早提交的——版本历史的时间线与配置内容的时间线不保证一致。
2. **回滚不回退版本号。** 回滚派生的新版本继续自增（`:314-318`），版本历史里会出现「0.3.0 的内容等于 0.1.0」；这是保历史不可变的刻意设计（`:247`），排查时不要找「版本号回退」。
3. **listReleases 无生产调用方。** 全仓库只剩定义处（`:343-354`）；GET /api/releases 在路由层内联重复实现同款过滤排序（`apps/web/app/api/releases/route.ts:13-17`）。改列表逻辑时两处需人工同步，否则行为漂移。
4. **SemVer 解析双实现并存。** compareSemVer 把非法版本视为 0.0.0（`:232-234`），versioning 的 parseVersion 把非法版本返回 null、进而按首次发布处理（`apps/web/lib/versioning.ts:28-34`、`:50-51`）。对脏数据的容错语义不同，修一处不代表另一处。
5. **版本历史路由全量返回。** GET /api/agents/[id]/versions 不分页（`apps/web/app/api/agents/[id]/versions/route.ts:22-31`），而版本数只增不减（回滚也新增版本），长期运行的 agent 该响应持续变大。

## 排查路由

出现无变更提交被拒 422、重复审批 409、版本号与预期不符、回滚行为不符预期等故障时读 `references/release-service-troubleshooting.md`。
