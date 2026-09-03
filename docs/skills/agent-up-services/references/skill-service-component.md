---
title: skill-service 组件视图
source: docs/distilled/skill-service.md
source_commit: 7524808330e38b5510c65b690348f59c127559c2
---

# skill-service 组件视图

> 蒸馏自 `docs/distilled/skill-service.md`（深度 standard，分量分 0.509）。本文件是组件视图；遇故障排查读 `references/skill-service-troubleshooting.md`。

## 何时读

- 要理解 Agent 技能目录与技能绑定关系的数据形态时。
- 要改 skill 列表过滤、详情聚合或绑定写路径时。
- 怀疑绑定快照、审计署名或软删语义时。

## 职责

`apps/web/lib/services/skill-service.ts` 是 Agent 技能目录与技能绑定关系的领域服务，9 个导出函数分两组：

1. **Skill CRUD**：listSkills（`skill-service.ts:6`）、getSkill（`skill-service.ts:37`）、createSkill（`skill-service.ts:63`）、updateSkill（`skill-service.ts:104`）、deleteSkill（`skill-service.ts:114`）
2. **绑定关系**：bindSkill（`skill-service.ts:124`）、unbindSkill（`skill-service.ts:169`）、getAgentSkillBindings（`skill-service.ts:187`）、toggleSkillBinding（`skill-service.ts:195`）

核心结构特征：绑定关系不落独立存储，而是内嵌在 agent 文件的 skillBindings 数组里（`skill-service.ts:134`、`skill-service.ts:158-164`）。

## 设计原理

**绑定关系随 agent 文件走，而非独立 join 表。** bindSkill 的读取与写入都以 agent 文件为容器：从 `agent.skillBindings` 取数组（`skill-service.ts:134`），改完整体写回 agents 目录（`skill-service.ts:164`）。这是文件存储下没有 join 能力的取舍——代价是反向查询（skill 指哪些 agent 绑了它）必须全量扫 agents 目录（`skill-service.ts:41-48`）。

**列表过滤与详情聚合是两条独立通路。** 列表走 store.queryList 的单文件过滤加手工分页排序（`skill-service.ts:13-34`，updatedAt 倒序 `skill-service.ts:31`）；详情则手动聚合三个数据源——skill 本体、扫全量 agents 反查出的 bindings、skill-versions 目录最新 10 条（`skill-service.ts:38-53`），并拼出 `_count`（`skill-service.ts:59`）。

**删除是归档，不是物理删除。** deleteSkill 只把 status 改为 ARCHIVED 后写回（`skill-service.ts:118`），与 agent-service 的软删约定一致——文件保留，历史绑定与版本引用不断链。

**author 与绑定人在创建时点做快照。** createSkill 把 authorId 与 authorName 一起落盘（`skill-service.ts:92-93`），bindSkill 把 boundBy 写进 binding（`skill-service.ts:150`）——历史事实不随主数据改名而变。

**默认值兜底集中在 createSkill。** category GENERAL、runtime HTTP、version 1.0.0、status DRAFT、publishedAt null、downloadCount 0 全在对象字面量里给默认（`skill-service.ts:82-91`），路由层 schema 只把少量字段标 optional。

## 关键决策

| # | 决策 | 动因与证据 |
|---|------|-----------|
| 1 | 绑定内嵌 agent 文件而非独立存储 | 文件存储无 join；写路径单文件完成（`skill-service.ts:134`、`skill-service.ts:164`）；代价见坑 6 |
| 2 | binding 内固化 skill 快照 | 绑定列表展示免二次读 skill 文件（`skill-service.ts:153`）；代价见坑 5 |
| 3 | 软删 ARCHIVED | 保持绑定与版本历史引用不断链（`skill-service.ts:118`） |
| 4 | category 与 status 的 ALL 豁免放在 service 层 | URL 传 ALL 与不传等价（`skill-service.ts:16-21`） |
| 5 | bindSkill 做幂等 upsert | 重复绑同一 skill 不报错，而是合并 config 并重新启用（`skill-service.ts:139-142`） |

## 暴露接口

| 函数 | 签名要点 | 行为摘要 |
|------|---------|---------|
| `listSkills({skip,take,category?,status?,search?})` | search 匹配 name、displayName、description（`skill-service.ts:22-29`） | queryList 过滤加分页，updatedAt 倒序；category 与 status 传 ALL 即不过滤（`skill-service.ts:16-21`） |
| `getSkill(id)` | 不存在返回 null（`skill-service.ts:39`） | 本体加全量扫 agents 反查 bindings（`skill-service.ts:41-48`）加最新 10 条版本（`skill-service.ts:50-53`）加 `_count` |
| `createSkill(data)` | 入参已经 createSkillSchema 校验 | 默认值兜底加 author 快照加 skill.create 审计（`skill-service.ts:100`） |
| `updateSkill(id, data)` | 全量展开合并 | 展开合并无字段白名单（`skill-service.ts:108`，坑 3）加 skill.update 审计 |
| `deleteSkill(id)` | 软删 | status 改 ARCHIVED（`skill-service.ts:118`）加 skill.archive 审计 |
| `bindSkill(agentId, skillId, config?)` | 双存在校验（`skill-service.ts:129-132`） | 幂等 upsert：已存在则合并 config 并重新启用（`skill-service.ts:139-142`），否则新建含 skill 快照的 binding；维护 `_count.skillBindings`（`skill-service.ts:162`）加 skill.bind 审计 |
| `unbindSkill(agentId, skillId)` | 静默删除 | 绑定不存在也返回 deleted 为 true（`skill-service.ts:184`，坑 2）加 skill.unbind 审计 |
| `getAgentSkillBindings(agentId)` | 只读 | agent 缺失返回空数组（`skill-service.ts:189`）；priority 倒序（`skill-service.ts:192`） |
| `toggleSkillBinding(agentId, skillId, enabled)` | **无生产调用方** | 缺绑定抛 NotFoundError（`skill-service.ts:200-201`）；不记审计（坑 1） |

## 数据流

skills 列表与创建路由走 store 标准通路；skill 详情聚合读三个数据源（skill 本体、全量 agents 反查、skill-versions 目录）；绑定写路径读改写 agents 目录下的 agent 文件内嵌 skillBindings。写路径全部收敛到两个文件加审计流：skill 元数据写 skills 目录，绑定关系写 agents 目录（读改写整文件覆盖，无并发保护，与全平台 store 写入一致）。审计方面 createSkill、updateSkill、deleteSkill、bindSkill、unbindSkill 都有 skill 动作审计，唯独 toggleSkillBinding 没接（坑 1）。

## 依赖与调用方

import 全集四项（`skill-service.ts:1-4`）：store、getActor、NotFoundError、recordAudit。

反向依赖（全部调用点）：

| 调用方 | 函数 |
|--------|------|
| app/api/skills/route.ts | listSkills、createSkill |
| app/api/skills/[id]/route.ts | getSkill、updateSkill、deleteSkill |
| app/api/agents/[id]/skills/route.ts | getAgentSkillBindings、bindSkill、unbindSkill |
| lib/__tests__/skill-service.test.ts | toggleSkillBinding（仅测试） |

数据面：读 skills、skill-versions、agents 目录；写 skills 目录下 skill 文件、agents 目录下 agent 文件、audit 日志（经 recordAudit）。字段校验依赖路由层的 createSkillSchema、updateSkillSchema、bindSkillSchema。

## 已知坑

1. **toggleSkillBinding 是死代码，且接上后会是无审计的写操作。** 全仓库唯一引用是定义（`skill-service.ts:195`）与单测（`skill-service.test.ts:10`），三个路由都没暴露"启用或停用绑定"能力。它作为绑定状态写操作却没有 recordAudit 调用——对照同文件 bindSkill 与 unbindSkill 都有。未来若把它接上路由，需先补审计。
2. **unbindSkill 对不存在的绑定静默成功。** filter 无命中时照常写回 agent 文件并返回 deleted 为 true（`skill-service.ts:173-184`），不抛 NotFoundError——与同文件 toggleSkillBinding 缺绑定时抛错行为不一致。客户端无法区分"解绑成功"与"本来就没绑"。
3. **updateSkill 全量展开，防线完全依赖路由 schema。** 展开合并不做字段白名单（`skill-service.ts:108`）。当前安全仅因唯一生产调用方传的是 updateSkillSchema 校验后的数据；直调 service 的新代码可覆盖 id、authorId、createdAt 等任意字段。
4. **status 为 PUBLISHED 与 publishedAt 字段脱节。** updateSkillSchema允许把 status 设为 PUBLISHED 或 DEPRECATED 但不接受 publishedAt；service 层也没有发布动作写它——运行时创建的 skill publishedAt 恒为 null（`skill-service.ts:90`），只有种子数据里有时间戳。
5. **bindSkill 只校验存在，不校验状态；binding 内快照不刷新。** 绑定前只查 skill 文件存在（`skill-service.ts:131-132`），ARCHIVED 的 skill 仍可绑到 agent 上；写入 binding 的 skill 快照（`skill-service.ts:153`）在 skill 改名后不会同步。
6. **getSkill 反查绑定需全量扫所有 agent 文件。** 每读一次 skill 详情就读全部 agents 文件再逐个翻 skillBindings（`skill-service.ts:41-48`）——agent 数量线性增长时该接口线性变慢，且这是详情页高频路径。
7. **unbind 路由漏了 withActor 包裹，解绑审计署名恒为"系统"。** 同路由文件里 POST 用了 withActor 包裹 resolveActor，DELETE 却直接调 unbindSkill（`route.ts:40`）——recordAudit 取到的是模块级兜底 SYSTEM_ACTOR（`context.ts:18-22`），真实操作者丢失。

## 排查路由

| 症状 | 去处 |
|------|------|
| 绑定列表里 skill 名字是旧的 | `references/skill-service-troubleshooting.md` |
| 解绑接口返回已解绑但绑定本来就不存在 | `references/skill-service-troubleshooting.md` |
| skill 详情接口慢 | `references/skill-service-troubleshooting.md` |
| 审计流里解绑记录的操作者都是系统 | `references/skill-service-troubleshooting.md` |
| publishedAt 一直是 null | `references/skill-service-troubleshooting.md` |
