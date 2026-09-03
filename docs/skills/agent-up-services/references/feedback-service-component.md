---
title: feedback-service 组件蒸馏
source: docs/distilled/feedback-service.md
source_commit: 7524808330e38b5510c65b690348f59c127559c2
---

# feedback-service 组件

> 蒸馏自 `docs/distilled/feedback-service.md`。故障排查读 `references/feedback-service-troubleshooting.md`。

## 何时读

需要理解或修改反馈单生命周期、8 状态状态机、状态驱动字段副作用，或给反馈系统加字段时读本篇。

## 职责

`apps/web/lib/services/feedback-service.ts` 管理用户对 Agent 的反馈单生命周期，共 4 个导出函数：

- `listFeedback`：多条件过滤列表（agentId / status / severity / rating / tag），按 submittedAt 倒序分页（`apps/web/lib/services/feedback-service.ts:42-75`）。
- `getFeedback`：单条详情，不存在返回 null（`apps/web/lib/services/feedback-service.ts:77-81`）。
- `createFeedback`：创建，校验 agent 存在后落盘并记审计（`apps/web/lib/services/feedback-service.ts:83-115`）。
- `updateFeedback`：更新，内嵌一个 8 状态的显式状态机（`apps/web/lib/services/feedback-service.ts:117-165`）。

## 设计原理

- **反馈单走显式状态机，转移表是唯一事实源。** 8 个状态定义（`apps/web/lib/services/feedback-service.ts:6-8`）；合法转移全部集中在常量表 ALLOWED_TRANSITIONS（`apps/web/lib/services/feedback-service.ts:15-24`）。头注释交代动因：「此前 updateFeedback 不校验转移，可从 NEW 直接跳 VERIFIED」，并声明 CLOSED / WONTFIX 为不可再转的终态（`apps/web/lib/services/feedback-service.ts:10-14`）。校验失败抛 ValidationError，details 带 from / to / allowed 三项方便调用方自诊（`apps/web/lib/services/feedback-service.ts:29-34`）。状态机只有两条回退边：RESOLVED 可回 IN_PROGRESS、VERIFIED 可回 IN_PROGRESS；其余全部单向前进或进终态。
- **状态驱动的字段副作用集中一处。** RESOLVED 打 resolvedAt、ASSIGNED 且带 assignedTo 时打 assignedTo/assignedAt、VERIFIED 打 verifiedAt（可选 verificationNote），全部集中在 updateFeedback 的一个分支块（`apps/web/lib/services/feedback-service.ts:143-154`）。
- **四个出口的数据形状一致。** withAgentName 给每条反馈补 agent 摘要；动因注释记录了「列表接口漏了 agent 字段，导致反馈中心页读 agent 名时直接崩溃」（`apps/web/lib/services/feedback-service.ts:72-74`）；四个落点分别在 list、get、create、update 的返回处（`apps/web/lib/services/feedback-service.ts:74`、`:80`、`:120`、`:164`）。
- **同状态更新放行。** status 不变时（只改 severity 等字段）不做转移校验（`apps/web/lib/services/feedback-service.ts:27`）。

## 关键决策

| # | 决策 | 动因与证据 |
|---|------|-----------|
| 1 | 状态转移显式校验，拒绝跳跃 | 动因注释（`apps/web/lib/services/feedback-service.ts:10-14`）+ 校验实现（`apps/web/lib/services/feedback-service.ts:26-35`） |
| 2 | 同状态更新放行 | 只改 severity 等字段时不做状态校验（`apps/web/lib/services/feedback-service.ts:27`） |
| 3 | 终态不可再转 | CLOSED / WONTFIX 的转移表为空数组（`apps/web/lib/services/feedback-service.ts:22-23`） |
| 4 | source 固定为 MANUAL | 创建入口当前只有手工提交一条路（`apps/web/lib/services/feedback-service.ts:101`）；sessionData 字段已预留（`apps/web/lib/services/feedback-service.ts:90`、`:109`） |
| 5 | 审计只记状态 from 与 to | `apps/web/lib/services/feedback-service.ts:160-163`；审计流与状态机职责分离 |

## 暴露接口

| 函数 | 签名要点 | 行为摘要 |
|------|---------|---------|
| `listFeedback(params)` | 5 个可选过滤键 + 分页 | tag 过滤要求 tags 是数组再 includes（`apps/web/lib/services/feedback-service.ts:64-66`）；status/severity/rating 三个键有 ALL 豁免（`apps/web/lib/services/feedback-service.ts:55-63`），tag 没有 |
| `getFeedback(id)` | 不存在返回 null | 补 agent 摘要后返回 |
| `createFeedback(input)` | agentId/title/content/rating 必填 | 校验 agent 存在（`apps/web/lib/services/feedback-service.ts:93-94`）→ 默认 severity MINOR、status NEW（`apps/web/lib/services/feedback-service.ts:106-107`）→ 记审计 |
| `updateFeedback(id, input)` | 全字段可选 | 状态转移校验 → 状态副作用 → 其余字段展开合并 → 记审计 |

## 数据流

以一次「分配 → 解决 → 验证」的处理流为例：PUT /api/feedback（body 带 id 与 status ASSIGNED 加 assignedTo）→ updateFeedback 读当前反馈 → 转移校验确认 NEW 到 ASSIGNED 合法 → 写 status/assignedTo/assignedAt → 全量写回 → recordAudit 记 from 与 to。RESOLVED 与 VERIFIED 同理，各自在副作用分支块追加时间戳字段。状态机全貌：NEW 可去 TRIAGED/WONTFIX/CLOSED；TRIAGED 可去 ASSIGNED/IN_PROGRESS/WONTFIX/CLOSED；ASSIGNED 可去 IN_PROGRESS/WONTFIX/CLOSED；IN_PROGRESS 可去 RESOLVED/WONTFIX/CLOSED；RESOLVED 可去 VERIFIED/IN_PROGRESS/CLOSED；VERIFIED 可去 CLOSED/IN_PROGRESS；CLOSED 与 WONTFIX 为终态。

## 依赖与调用方

- import 全集（`apps/web/lib/services/feedback-service.ts:1-4`）：store（持久层）、getActor（submittedBy 与审计身份）、NotFoundError/ValidationError、recordAudit（横向服务依赖）。
- 反向依赖：唯一路由入口 GET/POST/PUT /api/feedback（`apps/web/app/api/feedback/route.ts:12-29`、`:43-44`、`:66-68`）。注意该路由的 PUT 是「body 带 id」的扁平风格，而 releases 审批走 path 传 id 的 /api/releases/[id]/review——两套风格并存。

## 已知坑

1. **assignedTo 与 verificationNote 会被静默丢弃。** 入参类型里声明了这两个字段（`apps/web/lib/services/feedback-service.ts:126`、`:129`），但不在通用字段合并列表里（`apps/web/lib/services/feedback-service.ts:155-157` 只处理 severity/resolution/targetPartition）——只有 status 同步转移到 ASSIGNED / VERIFIED 时才落盘（`:146-149`、`:150-153`）。单独 PUT 只带 assignedTo 返回 200 但什么都没改。
2. **终态只是状态锁，不是只读锁。** CLOSED / WONTFIX 之后 status 不可再变，但 resolution、severity、targetPartition 等字段仍走通用合并（`apps/web/lib/services/feedback-service.ts:155-157`）可继续修改——依赖「终态即冻结」的调用方会踩空。
3. **tag 过滤参数无 ALL 豁免。** 其余三个过滤键显式跳过 ALL（`apps/web/lib/services/feedback-service.ts:55-63`），tag 直接按字面值匹配数组（`:64-66`）；前端若统一传 ALL 表示全部，tag 维度将返回空列表。
4. **targetPartition 软关联无外键约束。** 只存分区枚举（`apps/web/lib/services/feedback-service.ts:91`），与发布流水线的 Partition 大写枚举同名但无引用校验；反馈指向的分区配置被改或回滚，反馈单不会感知。

## 排查路由

出现状态迁移被拒 422、assignedTo 或 verificationNote 静默丢失、tag 过滤传 ALL 返回空、终态后字段仍可改等故障时读 `references/feedback-service-troubleshooting.md`。
