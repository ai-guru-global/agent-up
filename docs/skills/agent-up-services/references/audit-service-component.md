---
title: audit-service 组件蒸馏
source: docs/distilled/audit-service.md
source_commit: 7524808330e38b5510c65b690348f59c127559c2
---

# audit-service 组件

> 蒸馏自 `docs/distilled/audit-service.md`。故障排查读 `references/audit-service-troubleshooting.md`。

## 何时读

需要理解审计写入语义（fire-and-forget、actor 快照）、扩展审计覆盖面，或分析审计流与其他服务的关系时读本篇。

## 职责

`apps/web/lib/services/audit-service.ts` 是全局行为审计流，只有两个导出函数：

- `recordAudit(action, resource, resourceId, details?)`：追加一条审计记录，fire-and-forget 语义（`apps/web/lib/services/audit-service.ts:37`）。
- `listAudit(filters?)`：按 action / resource / resourceId 过滤、按时间倒序返回（`apps/web/lib/services/audit-service.ts:70`）。

它是全平台被依赖面最广的服务之一：agent / release / skill / wiki / feedback / effectiveness 六个服务与 settings 下三个路由都在写操作后调用它，所有记录落在单一文件 `data/settings/audit-logs.json`（`apps/web/lib/services/audit-service.ts:27`）。

## 设计原理

- **单文件 append-only 数组。** 记录体结构 AuditLogEntry（`apps/web/lib/services/audit-service.ts:16-25`）；采用数组结构是与现有种子兼容的取舍（`apps/web/lib/services/audit-service.ts:7`）；追加实现是「读全量数组 → push → 整体写回」（`apps/web/lib/services/audit-service.ts:56-58`），底层走 store 的全量覆盖写（`apps/web/lib/data/store.ts:141-144`）。
- **fire-and-forget：审计失败不回滚业务。** docstring 写明动因「审计失败不应让业务写操作回滚」（`apps/web/lib/services/audit-service.ts:33-36`）；写失败 catch 住只打日志（`apps/web/lib/services/audit-service.ts:55-65`，测试环境连日志都不打）。因此 recordAudit 永不抛错，调用方无需 try/catch。
- **actor 在写入时点做快照。** 记录固化 userName 与 userRole 字符串（`apps/web/lib/services/audit-service.ts:49-50`），来自 getActor()（`apps/web/lib/services/audit-service.ts:43`）——即请求头 x-actor-* 解析出的临时身份（`apps/web/lib/context.ts:29-39`），缺省 system；actor.id 被丢弃。头注释点明这一步「彻底替代此前散落硬编码的 system」（`apps/web/lib/services/audit-service.ts:8`）。
- **与配置 diff 明细分工。** 本服务回答「谁在何时做了什么」；agent-service 的 recordConfigChange 写 config-changes 目录、回答「具体改了什么」（`apps/web/lib/services/audit-service.ts:10-13`）。

## 关键决策

| # | 决策 | 动因与证据 |
|---|------|-----------|
| 1 | 审计失败静默吞掉 | docstring 动因（`apps/web/lib/services/audit-service.ts:33-36`）+ catch 块注释（`apps/web/lib/services/audit-service.ts:59-60`） |
| 2 | 记录里固化 name/role 快照而非引用 | 审计是历史事实，不随主数据改名而变（`apps/web/lib/services/audit-service.ts:49-50`） |
| 3 | 单文件数组而非一事件一文件 | 兼容现有种子数据（`apps/web/lib/services/audit-service.ts:7`）；写放大代价见已知坑 |
| 4 | details 可选展开写入 | 无 details 时不产生空字段（`apps/web/lib/services/audit-service.ts:52`） |

## 暴露接口

| 函数 | 签名要点 | 行为摘要 |
|------|---------|---------|
| `recordAudit(action, resource, resourceId, details?)` | 同步、永不抛错 | 组装条目 → try 写入 → 失败仅打日志；返回组装好的条目（无论落盘与否，`apps/web/lib/services/audit-service.ts:66`） |
| `listAudit(filters?)` | 三个可选过滤键 | createdAt 倒序（`apps/web/lib/services/audit-service.ts:81`）；无分页；注意已知坑 1 |

## 数据流

写入侧：六个服务与 settings 下三个路由（产品组、权限、角色）在业务写成功后调 recordAudit，实现是读全量数组、push、整体写回 `data/settings/audit-logs.json`。读侧只有一条路：审计日志页走 GET /api/settings/audit-logs，该路由直接读文件并内联实现过滤、排序、分页（`apps/web/app/api/settings/audit-logs/route.ts:14-22`），没有经过 listAudit。action 命名有两套约定：service 层点分小写（agent.create），settings 路由层下划线（product_group.create，`apps/web/app/api/settings/product-groups/route.ts:32`）。

## 依赖与调用方

- import 全集仅两项（`apps/web/lib/services/audit-service.ts:1-2`）：store（readArray/writeArray/generateId/now）与 getActor。没有 import errors——它不抛错，也不校验入参。
- 反向依赖按模块：agent-service（agent.create / agent.update / agent.archive / agent.config.update）、release-service（release.submit / release.approve 等 / agent.rollback）、skill-service（skill.create / skill.bind / skill.unbind 等）、wiki-service（wiki.vault.* / wiki.page.*）、feedback-service（feedback.create / feedback.update）、effectiveness-service（version.effectiveness.computed）、settings 路由层（product_group.create / permission.create / role.*，不经 service）。

## 已知坑

1. **listAudit 无生产调用方，docstring 与实际不符。** 函数注释声称供 GET /api/settings/audit-logs 使用（`apps/web/lib/services/audit-service.ts:69`），但该路由直接读文件并内联实现同款过滤排序，还多出 listAudit 不支持的 userName/userId 过滤（`apps/web/app/api/settings/audit-logs/route.ts:14-18`）。改审计查询逻辑要以路由层为准，两处需人工同步。
2. **审计记录不含操作者 ID。** 条目只固化 userName 与 userRole（`apps/web/lib/services/audit-service.ts:49-50`），actor.id 在组装时被丢弃——同名不同人的操作在审计流里无法区分，追责只到「名字」粒度。
3. **每次追加都是全量重写。** 读全量 → push → 整体覆盖（`apps/web/lib/services/audit-service.ts:56-58`），审计流越长写放大越明显，且与其他写操作一样无并发保护——两个请求同时写审计时后写者覆盖前写者的条目（读-改-写竞态）。
4. **静默失败无告警通路。** 写失败只走 console.error 且测试环境连日志都省略（`apps/web/lib/services/audit-service.ts:61-64`），系统层面没有审计丢失的度量；对审计完整性有硬要求的场景需另行补监控。

## 排查路由

出现审计记录缺失、userName 与实际操作者对不上、按 action 或 userId 搜不到、审计文件损坏等故障时读 `references/audit-service-troubleshooting.md`。
