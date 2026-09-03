---
title: effectiveness-service 组件蒸馏
source: docs/distilled/effectiveness-service.md
source_commit: 7524808330e38b5510c65b690348f59c127559c2
---

# effectiveness-service 组件

> 蒸馏自 `docs/distilled/effectiveness-service.md`。故障排查读 `references/effectiveness-service-troubleshooting.md`。

## 何时读

需要理解或修改版本效果报告（lazy fill、7 天窗口、三维聚合、幂等写回）时读本篇。

## 职责

`apps/web/lib/services/effectiveness-service.ts`（单文件 175 行）只做一件事：为已发布的 Version 生成一份「发布后 N 天窗口内效果如何」的结构化报告 EffectivenessReport，并通过 lazy fill 写回 `version.effectivenessReport`。头注释完整声明了策略（`apps/web/lib/services/effectiveness-service.ts:4-27`）：lazy fill 触发条件与取舍、幂等语义、默认 7 天窗口、报告字段清单。

生产入口只有两个，且都是 GET 路由：版本历史列表对每个 version 逐个调用（`apps/web/app/api/agents/[id]/versions/route.ts:33-37`），单版本详情调用一次（`apps/web/app/api/agents/[id]/versions/[versionId]/route.ts:28`）。两个路由的 docstring 都明示了 GET 带写副作用这一事实。

## 设计原理

- **Lazy fill 而非定时任务。** 头注释明示不引入 cron / 定时任务，把「发布满 7 天」这个时间条件转嫁到读路径：GET version 时若 publishedAt 距今满窗口期且报告为空，现场计算并写回；优点零运维，缺点首读触发计算（`apps/web/lib/services/effectiveness-service.ts:10-13`）。代价不只是首读延迟——读接口同时获得写副作用。
- **纯函数与 IO 分离。** 聚合逻辑收在 computeEffectivenessReport（`apps/web/lib/services/effectiveness-service.ts:79-122`），docstring 明示「不读 store，不写副作用，纯计算。便于单测」（`apps/web/lib/services/effectiveness-service.ts:70-73`），时间基准 now 可注入（`apps/web/lib/services/effectiveness-service.ts:77`）；测试直接打纯函数并注入固定时间。
- **窗口语义。** windowEnd = publishedAt + windowDays，用 setDate 在本地时区上加天数（`apps/web/lib/services/effectiveness-service.ts:86-88`）；只统计 publishedAt 与 submittedAt 都落在窗口内且 agentId 匹配的 feedback（`apps/web/lib/services/effectiveness-service.ts:90-95`）。
- **三维聚合，未知枚举值静默丢弃。** 按 rating（POSITIVE/NEGATIVE/NEUTRAL）、severity（CRITICAL/MAJOR/MINOR/SUGGESTION）、targetPartition（PROMPT/KNOWLEDGE/TOOLS/ROUTING）各聚合一桶；循环体用 in 成员检查后递增（`apps/web/lib/services/effectiveness-service.ts:101-111`），不在枚举内的值不进任何桶也不报错。
- **幂等短路 + 判断前 refetch + onDisk 守卫。** 报告已存在则直接返回、不再计算（`apps/web/lib/services/effectiveness-service.ts:142`）；判断前先 refetch 磁盘上的 version，注释明示解决「同 test 内连续两次调用导致重复算」与并发竞态（`apps/web/lib/services/effectiveness-service.ts:134-139`）；store.write 与 recordAudit 包在 if (onDisk) 内（`apps/web/lib/services/effectiveness-service.ts:161-172`），磁盘无该 version 时只算不落盘。

## 关键决策

| # | 决策 | 动因与证据 |
|---|------|-----------|
| 1 | lazy fill 零运维，不引 cron | 头注释自述取舍（`apps/web/lib/services/effectiveness-service.ts:10-13`）；版本历史页访问频率低所以可接受 |
| 2 | 纯函数 / IO 分离 | computeEffectivenessReport 不碰 store、now 可注入（`apps/web/lib/services/effectiveness-service.ts:70-78`），单测无需 mock |
| 3 | 默认窗口 7 天 | DEFAULT_WINDOW_DAYS（`apps/web/lib/services/effectiveness-service.ts:29`），覆盖「版本上线一周后的效果窗口」（`apps/web/lib/services/effectiveness-service.ts:16-17`） |
| 4 | 判断前先 refetch 磁盘 | 解决同 test 重复算与并发竞态（`apps/web/lib/services/effectiveness-service.ts:134-139`）；测试验证连续两次调用只算一次 |
| 5 | 只在磁盘上存在该 version 时写回 | if (onDisk) 包住 store.write 与 recordAudit（`apps/web/lib/services/effectiveness-service.ts:161-172`），纯内存传入的 version 算完不落盘 |

## 暴露接口

| 函数/类型 | 签名要点 | 行为摘要 |
|------|---------|---------|
| `computeEffectivenessReport(version, allFeedbacks, options?)` | 纯函数；调用方负责把 feedback 过滤到该 agent（窗口过滤内部还会再按 agentId 过滤一次，`apps/web/lib/services/effectiveness-service.ts:92`） | 返回 EffectivenessReport；不读 store、不写、不抛错（`apps/web/lib/services/effectiveness-service.ts:79-122`） |
| `getOrComputeEffectivenessReport(versionIn, options?)` | 带 IO 的入口 | 返回 EffectivenessReport 或 null（null 仅一种含义：未到窗口，`apps/web/lib/services/effectiveness-service.ts:151`）；满足条件时写回 version 并记审计（`apps/web/lib/services/effectiveness-service.ts:130-175`） |
| `DEFAULT_WINDOW_DAYS` | 常量 7 | `apps/web/lib/services/effectiveness-service.ts:29` |
| `EffectivenessReport` | 9 字段类型 | totalFeedbacks / byRating / bySeverity / byPartition / computedAt / versionPublishedAt / windowDays（`apps/web/lib/services/effectiveness-service.ts:31-39`） |

## 数据流

调用链是：GET versions 列表或单版本详情 → getOrComputeEffectivenessReport → refetch 磁盘上的 version → 报告已存在则直接返回；否则判断距今是否满窗口（未满返回 null）→ 满窗口则全量读 feedback 并按 agentId 过滤 → 纯函数计算三维聚合 → 磁盘上存在该 version 则写回并记 `version.effectiveness.computed` 审计，不存在则只返回不落盘。版本历史路由在 versions.map 循环内对每个 version 各走一遍这条链（`apps/web/app/api/agents/[id]/versions/route.ts:34-37`），一次 GET 最坏触发多轮独立的全量 feedback 扫描。写回成功后审计署名恒为「系统」：lazy fill 由 GET 触发且两个调用路由都未用 withActor 装配。

## 依赖与调用方

- import 全集两项（`apps/web/lib/services/effectiveness-service.ts:1-2`）：store（读 versions 与全量 feedback、写回 version 文件）与 recordAudit（写回成功后记 version.effectiveness.computed，details 含 agentId / totalFeedbacks / windowDays，`apps/web/lib/services/effectiveness-service.ts:167-171`）。
- 反向依赖：两个 GET 路由（versions 列表逐 version 循环调用、单版本详情调用一次）、API 集成测试（纯函数 + lazy fill + 集成三层）、前端版本详情页（效果标签只在满 7 天后展示，lazy fill 由 API 端完成）。

## 已知坑

1. **GET 产生写副作用。** 首读会同时改数据与审计流（写回幂等，但审计里的 version.effectiveness.computed 由浏览行为产生、署名恒为「系统」）。
2. **每次计算全量扫 feedback。** getOrCompute 每次计算都 store.list("feedback") 全量读再过滤（`apps/web/lib/services/effectiveness-service.ts:154-156`）；版本历史路由对每个缺报告且过窗口的 version 各触发一轮（`apps/web/app/api/agents/[id]/versions/route.ts:34-37`），最坏成本为版本数与反馈数的乘积。
3. **报告写回后永不重算。** effectivenessReport 非空即短路（`apps/web/lib/services/effectiveness-service.ts:142`），没有失效机制；「永不重算」语义未在头注释声明（头注释只写了幂等）。
4. **refetch 只防重复算，不防并发双写。** 判断与写回之间无锁，并发 GET 可各自写回；数据无害（纯函数输出相同、全量覆盖），可见影响是审计流出现两条 version.effectiveness.computed。
5. **磁盘上无该 version 时计算结果悬空。** 生产路由都从 store.read 取 version 所以正常路径恒存在；风险面在未来新增的调用方——报告照算照返回但不落盘不审计，每次调用都重算。

## 排查路由

出现效果标签不显示、报告数字与预期不符、需要强制重算、审计出现「系统」署名效果记录等故障时读 `references/effectiveness-service-troubleshooting.md`。
