---
title: retrieval-service 组件视图
source: docs/distilled/retrieval-service.md
source_commit: 7524808330e38b5510c65b690348f59c127559c2
---

# retrieval-service 组件视图

> 蒸馏自 `docs/distilled/retrieval-service.md`（深度 standard，分量分 0.339）。本文件是组件视图；遇故障排查读 `references/retrieval-service-troubleshooting.md`。

## 何时读

- 要理解 wiki 知识检索的算法形态（BM25-lite）与打分口径时。
- 要把检索接进试聊或评测链路，需要先确认接线现状与返回值语义时。
- 怀疑检索结果覆盖率或跨库可比性时。

## 职责

`apps/web/lib/services/retrieval-service.ts` 是知识库的 BM25-lite 本地文本检索服务，意图是对某个 wiki vault 的页面做关键词检索，为 Agent 试聊与评测重放提供知识上下文（`retrieval-service.ts:4-5`）。对外只暴露两个入口：`searchWiki`（`retrieval-service.ts:140`）与纯函数 `tokenize`（`retrieval-service.ts:50`）。

**关键现状：该服务在生产代码中零调用。** 全仓库唯一的 import 来自测试文件（`retrieval-service.test.ts:6`），头注释与 searchWiki docstring 声称的"在 agent 的试聊流程和评测重放中调用"（`retrieval-service.ts:134-139`）与实际不符。整套 BM25 检索是"已建成、未接线"状态。

## 设计原理

**BM25-lite：有 tf 饱和、无 IDF。** 实现用 tfSat 做饱和 tf 除以 tf 加 1.2（`retrieval-service.ts:71-73`），不维护语料统计——无倒排索引、无 IDF，每页对查询 token 逐一扫描四个字段（`retrieval-service.ts:118-132`）。

**中英混合分词。** tokenize 先全小写、再按"连续 CJK 与连续拉丁数字"切段（`retrieval-service.ts:51-54`）；CJK 段拆成单字加相邻双字 bigram（`retrieval-service.ts:56-62`），拉丁段保留整词（`retrieval-service.ts:63-65`）。计数端配套：长度不大于 2 的 token 走子串计数（`retrieval-service.ts:77-86`），拉丁词走词边界正则（`retrieval-service.ts:88-89`）——tokenize 产出的拉丁段只含小写字母数字，拼进正则没有注入面。

**字段加权与置信度合成。** 打分按字段加权累计：title 3 倍、tags 2 倍、summary 1 倍、content 0.5 倍（`retrieval-service.ts:126-129`）；原始分用本 vault 本次查询的最高分归一到 0 到 1（`retrieval-service.ts:158-160`），再与页面 baseConfidence 按 0.6 与 0.4 加权得最终 confidence（`retrieval-service.ts:165`）。

**失败表达全靠返回值，不抛错。** 空入参（`retrieval-service.ts:143-145`）、空 vault（`retrieval-service.ts:147-150`）、零命中（`retrieval-service.ts:200`）都返回结构化空结果且 fallbackTriggered 为 true，调用方据此降级。

## 关键决策

| # | 决策 | 动因与证据 |
|---|------|-----------|
| 1 | BM25-lite 而非完整 BM25 或向量检索 | 无 IDF、无索引的轻量实现（`retrieval-service.ts:71-73`、`retrieval-service.ts:118-132`） |
| 2 | CJK 单字加 bigram 混合分词 | 单字保召回、bigram 保区分度（`retrieval-service.ts:58-61`） |
| 3 | 字段权重 title 大于 tags 大于 summary 大于 content | 标题命中最可信、正文命中最弱（`retrieval-service.ts:126-129`） |
| 4 | 检索分与 baseConfidence 按 0.6 与 0.4 加权 | 检索相关性为主、页面先验质量为辅（`retrieval-service.ts:165`） |
| 5 | 结果与落选双数组返回 | 达标进 results 并标 usedInContext，未达标进 belowThreshold（`retrieval-service.ts:186-190`） |

## 暴露接口

| 函数 | 签名要点 | 行为摘要 |
|------|---------|---------|
| `tokenize(text)` | 纯函数 | 全小写；CJK 单字加 bigram、拉丁整词（`retrieval-service.ts:50-68`） |
| `searchWiki(params)` | query、vaultId、maxResults、confidenceThreshold 必填 | 返回 results（usedInContext 为 true）加 belowThreshold 加 candidates 加 fallbackTriggered（`retrieval-service.ts:194-201`）；永不抛错 |

响应字段语义：candidates 是参与打分的页面数（`retrieval-service.ts:197`）；excerpt 固定取 content 前 400 字符（`retrieval-service.ts:182`）；strategy 恒为字符串 BM25_LITE。

## 数据流

查询加 vaultId 进入后先做空入参与空 vault 预检，未通过直接返回 fallbackTriggered 为 true 的空结果；通过则 tokenize 分词，对 `data/wiki-vaults/<vaultId>/pages/*.json` 全页逐字段打分，按本 vault 最高原始分归一化并与 baseConfidence 合成 confidence，按 score 降序排列后逐个判定：confidence 达标且名额未满进 results，其余进 belowThreshold。读侧数据面只读页面 JSON，不写任何文件。

## 依赖与调用方

import 全集三项（`retrieval-service.ts:13-15`）：fs 三函数 readdirSync、readFileSync、existsSync，join，以及从 store 导入的 `_getDataDir`——第三项 import 后从未使用（见已知坑 2）。零 store API、零审计、零错误体系、零 actor。

反向依赖：唯一调用方是测试文件 `apps/web/lib/__tests__/retrieval-service.test.ts`（`retrieval-service.test.ts:6`）。

## 已知坑

1. **生产代码零调用，docstring 声称的调用方不存在。** 头注释与 searchWiki docstring 都说在 agent 试聊与评测重放中调用（`retrieval-service.ts:4-5`、`retrieval-service.ts:137-138`），但唯一 import 是测试文件——试聊路由并未引用本模块。读代码时不要被 docstring 误导架构现状。
2. **import 了 `_getDataDir` 却硬编码数据根。** 导入处（`retrieval-service.ts:15`）与实际读文件写死 `join(process.cwd(), "data", ...)`（`retrieval-service.ts:104`）并存——与 wiki-service 的 deleteVault 同款绕过 dataDirOverride 问题，且未使用的 import 暴露了本意。
3. **损坏页面静默消失于检索结果。** loadPages 对 JSON 解析失败 catch 后返回 null 再过滤（`retrieval-service.ts:109-114`）——与 wiki-service 的 listPages 遇坏文件抛错策略相反；坏页面不参与检索也不产生日志，知识覆盖面悄悄缩水。
4. **排序键与准入键不一致。** 页面按 score 降序（`retrieval-service.ts:170`），进 results 的判定用 confidence（`retrieval-service.ts:186`）——score 靠前但 baseConfidence 偏低的页面先消耗 maxResults 名额，confidence 达标的页面可能被挤进 belowThreshold。
5. **confidence 是 vault 内相对分，跨库不可比。** 归一化基准是本次查询在本 vault 的最高分（`retrieval-service.ts:158-160`）——同一 confidenceThreshold 在小库、大库、内容变化后的库上松紧不同。
6. **无索引，纯线性扫描。** 每次检索对全部页面、每页对每个查询 token 扫四个字段全文（`retrieval-service.ts:125-129`），CJK bigram 让 token 数约为字数两倍——接线上量前需重估成本。

## 排查路由

| 症状 | 去处 |
|------|------|
| 想在试聊或评测里启用知识检索 | `references/retrieval-service-troubleshooting.md` |
| 明明存在的页面检索不出来 | `references/retrieval-service-troubleshooting.md` |
| 同一查询在不同 vault 表现差异大 | `references/retrieval-service-troubleshooting.md` |
| belowThreshold 里出现 confidence 达标的页面 | `references/retrieval-service-troubleshooting.md` |
