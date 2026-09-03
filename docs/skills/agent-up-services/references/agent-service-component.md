---
title: agent-service 组件蒸馏
source: docs/distilled/agent-service.md
source_commit: 7524808330e38b5510c65b690348f59c127559c2
---

# agent-service 组件

> 蒸馏自 `docs/distilled/agent-service.md`。锚点均为行内代码标注的 file:line；故障排查读 `references/agent-service-troubleshooting.md`。

## 何时读

需要了解或修改 Agent 主资源 CRUD、四分区配置读写、配置变更双写留痕、软删除与出口形状统一时读本篇。

## 职责

`apps/web/lib/services/agent-service.ts` 是 Agent 主资源与 4 分区配置的读写层，11 个导出函数分四组：

- 主资源 CRUD：listAgents（`apps/web/lib/services/agent-service.ts:37`）、getAgent（`apps/web/lib/services/agent-service.ts:62`）、createAgent（`apps/web/lib/services/agent-service.ts:78`）、updateAgent（`apps/web/lib/services/agent-service.ts:115`）、deleteAgent（`apps/web/lib/services/agent-service.ts:140`，软删除置 ARCHIVED）。
- 分区配置读写：getAgentConfig（`apps/web/lib/services/agent-service.ts:150`）加四个 update*Config 薄封装（`apps/web/lib/services/agent-service.ts:176-190`），实际逻辑集中在私有函数 updateConfigPartition（`apps/web/lib/services/agent-service.ts:158`）。
- 配置变更留痕：recordConfigChange（`apps/web/lib/services/agent-service.ts:197`）写 config-changes 明细并同步记审计。
- 出口形状统一：withProductGroup（`apps/web/lib/services/agent-service.ts:23`）把 productGroupId 补齐成完整产品组对象。

## 设计原理

- **配置分区是 agent JSON 内嵌字段，不是独立资源。** prompt/knowledge/tools/routing 四分区（类型 `apps/web/lib/services/agent-service.ts:7`）作为 xxxConfig 字段存在 agent 文件里；updateConfigPartition 读整个 agent、合并 data、version 自增、打 lastModifiedAt 后全量写回（`apps/web/lib/services/agent-service.ts:158-174`），是 store 全量覆盖写模型（`apps/web/lib/data/store.ts:52-55`）下的自然形态。
- **改配置与留痕是两个动作，由路由层编排。** 分区路由在 withActor 作用域内先取 before、再调 update*Config、最后 recordConfigChange 记 before/after diff（`apps/web/app/api/agents/[id]/config/[partition]/route.ts:60-81`）；回滚路由复用同款编排，注释自述「本质 = 用历史快照 PUT 一次配置」（`apps/web/app/api/agents/[id]/config/[partition]/rollback/route.ts:38`）。
- **双写各有分工。** recordConfigChange 写 `data/config-changes/<id>.json` 存 diff 全文；审计流回答「谁在何时做了什么」，config-changes 回答「具体改了什么」（`apps/web/lib/services/audit-service.ts:10-13`）。
- **列表出口统一补齐产品组。** 种子数据与部分读路径只有 productGroupId，直接渲染会出占位符；withProductGroup 的 docstring 记录了「保证四个出口数据形状一致」的动因（`apps/web/lib/services/agent-service.ts:17-22`）。

## 关键决策

| # | 决策 | 动因与证据 |
|---|------|-----------|
| 1 | deleteAgent 不真删，置 ARCHIVED | 实现与 `agent.archive` 审计（`apps/web/lib/services/agent-service.ts:140-148`），路由响应语也是「Agent 已归档」 |
| 2 | createAgent 校验产品组存在，初始配置全空 | 产品组不存在抛 NotFoundError（`apps/web/lib/services/agent-service.ts:83-87`）；初始 4 分区为 null、skillBindings 空数组、计数归零（`apps/web/lib/services/agent-service.ts:101-107`） |
| 3 | changedBy 从 actor context 取，不再硬编码 | recordConfigChange docstring 明确记录（`apps/web/lib/services/agent-service.ts:192-196`） |
| 4 | 审计明细只带 diff 键名摘要，不嵌全文 | details 放 added/removed/changed 键名列表（`apps/web/lib/services/agent-service.ts:222-226`），完整 before/after 存 config-changes 文件 |
| 5 | getAgent 聚合视图带 PENDING releases 与最近 5 个版本 | `apps/web/lib/services/agent-service.ts:66-75`；versions 截 5 条的边界见已知坑 |

## 暴露接口

| 函数 | 签名要点 | 行为摘要 |
|------|---------|---------|
| `listAgents(params)` | skip/take/status/productGroupId/search | store.queryList 过滤 + updatedAt 倒序 + 分页（`apps/web/lib/services/agent-service.ts:37-60`） |
| `getAgent(id)` | 不存在返回 null（非抛错） | 聚合 PENDING releases + 最近 5 个 versions |
| `createAgent(input)` | name/productGroupId 必填 | 校验产品组 → 建 DRAFT agent → 记审计 |
| `updateAgent(id, input)` | name/description/status 部分更新 | 展开合并 + 刷 updatedAt + 补 productGroup |
| `deleteAgent(id)` | 软删除 | 置 ARCHIVED + 记 `agent.archive` |
| `getAgentConfig(agentId, partition)` | 四分区通读 | 不存在分区字段返回 null（`apps/web/lib/services/agent-service.ts:155`） |
| `updatePromptConfig` 等四个 | 薄封装 | 全部委托 updateConfigPartition |
| `recordConfigChange(agentId, partition, before, after, changeNote?)` | diff 全文落盘 | 写 config-changes + 记审计，返回 change 对象（`apps/web/lib/services/agent-service.ts:207-228`） |

## 数据流

分区配置更新的完整链路是三步编排：路由先 getAgentConfig 取 before，再调 update*Config（委托 updateConfigPartition：合并 data、version 自增、全量写回），最后 recordConfigChange 把 diff 全文写进 config-changes 目录并向审计流记 `agent.config.update`（details 只带键名摘要）。分区回滚是同款编排的历史快照特例：把目标 version 的分区快照经 update*Config 写回。

## 依赖与调用方

- import 全集（`apps/web/lib/services/agent-service.ts:1-5`）：store、getActor、NotFoundError 与 ValidationError（后者导入后未使用，见已知坑）、recordAudit、computeJsonDiff（`apps/web/lib/services/agent-service.ts:205`）。
- 路由调用方：GET/POST /api/agents（listAgents/createAgent）、GET/PUT/DELETE /api/agents/[id]（getAgent/updateAgent/deleteAgent）、GET/PUT /api/agents/[id]/config/[partition]（getAgentConfig + update*Config + recordConfigChange）、POST /api/agents/[id]/config/[partition]/rollback（回滚编排）。

## 已知坑

1. **读-改-写无并发保护。** updateConfigPartition 与 updateAgent 都整文件覆盖写（`apps/web/lib/services/agent-service.ts:158-174`），并发写同一 agent 时后写者覆盖前写者，config-change 的 before/after 与实际落地序列不保证一致；单机演示可接受，多操作者同时编辑需人工协调。
2. **withProductGroup 在列表路径逐行读文件。** 每次调用完整读一遍 settings/product-groups.json（`apps/web/lib/services/agent-service.ts:24-27`），listAgents 每页每条各调一次（`apps/web/lib/services/agent-service.ts:59`）——一页 20 条就是 20 次同文件读取，数据量大时列表接口明显变慢。
3. **ValidationError 导入未使用**（`apps/web/lib/services/agent-service.ts:3`）：不要据此推断本服务有入参校验逻辑，校验在路由层 schemas 完成。
4. **getAgent 的 versions 只取最近 5 条**（`apps/web/lib/services/agent-service.ts:70-73`）：完整版本历史要走 versions 路由（全量返回）；两处行为不同，前端按需选对入口。

## 排查路由

出现配置保存异常、versions 数量与预期不符、列表产品组为空、配置留痕缺失、版本号不连续等故障时读 `references/agent-service-troubleshooting.md`。
