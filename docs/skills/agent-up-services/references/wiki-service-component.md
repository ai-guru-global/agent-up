---
title: wiki-service 组件视图
source: docs/distilled/wiki-service.md
source_commit: 7524808330e38b5510c65b690348f59c127559c2
---

# wiki-service 组件视图

> 蒸馏自 `docs/distilled/wiki-service.md`（深度 standard，分量分 0.519）。本文件是组件视图；遇故障排查读 `references/wiki-service-troubleshooting.md`。

## 何时读

- 要理解 Wiki Vault 与 Wiki Page 的存储形态与删除语义时。
- 要改知识库列表过滤、分页或页面定位逻辑时。
- 怀疑 vault 统计字段、tag 过滤或数据根路径问题时。

## 职责

`apps/web/lib/services/wiki-service.ts` 是知识库（Wiki Vault）与知识页（Wiki Page）的领域服务，8 个导出函数分两层：

1. **Vault 层**：listVaults（`wiki-service.ts:7`）、getVault（`wiki-service.ts:25`）、createVault（`wiki-service.ts:29`）、updateVault（`wiki-service.ts:62`）、deleteVault（`wiki-service.ts:72`）
2. **Page 层**：listPages（`wiki-service.ts:87`）、getPage（`wiki-service.ts:133`）、createPage（`wiki-service.ts:144`）、updatePage（`wiki-service.ts:194`）、deletePage（`wiki-service.ts:211`）

它与其他 service 最大的结构差异：page 不是独立顶层目录，而是以"每页一文件"嵌套存储在各自 vault 目录的 pages 子目录下（`wiki-service.ts:186`）。

## 设计原理

**Page 物理嵌套在 vault 目录下。** createVault 在建 vault 元数据的同时建出 pages 子目录（`wiki-service.ts:56-57`）；createPage 把页面写进该嵌套路径（`wiki-service.ts:186`）。物理隔离随 vault 走，删除 vault 时整目录一起消失——代价是跨 vault 的 page 定位没有索引，见坑 3。

**listPages 绕过 store 抽象，直接用 fs 原生 API。** 目录不存在返回空集（`wiki-service.ts:96-97`）；否则 readdirSync 列文件、readFileSync 逐个读、JSON 解析（`wiki-service.ts:99-108`），过滤（lifecycle 与 tier 有 ALL 豁免 `wiki-service.ts:110-115`，tag 与 search 无豁免 `wiki-service.ts:116-125`）、排序（`wiki-service.ts:127`）、slice 分页（`wiki-service.ts:129`）全部手工完成。

**Vault 元数据走标准 store 通路。** listVaults 用 store.queryList（`wiki-service.ts:13-22`，updatedAt 倒序），getVault 直接 read（`wiki-service.ts:25-27`）——同一 service 内两种存储访问风格并存。

**gitRepoUrl 空串规范化为 null。** createVault 用逻辑或而非空值合并（`wiki-service.ts:45`），与 schema 层允许空串的设计配合——空值统一成一个形态。

**删除语义：vault 与 page 都是物理删除。** deleteVault 递归删目录后 store.delete 元数据（`wiki-service.ts:76-82`）；deletePage 直接删页面文件（`wiki-service.ts:216`）。这与 agent、skill 的"归档不删除"软删约定相反，只有审计记录可追溯。

## 关键决策

| # | 决策 | 动因与证据 |
|---|------|-----------|
| 1 | page 嵌套存储在 vault 子目录 | 物理隔离随 vault 走，整库可一键迁移或删除（`wiki-service.ts:57`、`wiki-service.ts:79-80`）；代价见坑 3 |
| 2 | listPages 手工 fs 扫描 | 嵌套目录的读取在 service 内自足完成，不依赖 store 的列表能力（`wiki-service.ts:99-129`） |
| 3 | 路由 path 的 vaultId 覆盖 body | pages 路由注释明确 path 的 id 为权威 vaultId（`route.ts:26-27`） |
| 4 | gitRepoUrl 空串归一为 null | schema 允许空串，service 用逻辑或收口（`wiki-service.ts:45`） |
| 5 | vault 统计字段一次性初始化 | pageCount、avgConfidence、orphanCount 建库时置 0（`wiki-service.ts:47-49`），不做增量维护——代价见坑 2 |

## 暴露接口

| 函数 | 签名要点 | 行为摘要 |
|------|---------|---------|
| `listVaults({skip,take,agentId?,shared?})` | shared 是布尔（`wiki-service.ts:17`） | queryList 过滤加分页，updatedAt 倒序；注意路由层只传 true（坑 5） |
| `getVault(id)` | 不存在返回 undefined 转 null | 直接 read，无聚合 |
| `createVault(data)` | 已过 createWikiVaultSchema | 默认值兜底（gitBranch main、统计字段 0）加建 pages 目录加 wiki.vault.create 审计（`wiki-service.ts:58`） |
| `updateVault(id, data)` | 全量展开 | 展开合并无白名单（`wiki-service.ts:66`，坑 7）加 wiki.vault.update 审计 |
| `deleteVault(id)` | **物理删除** | 递归删 pages 目录与 vault 目录（`wiki-service.ts:76-80`）转删元数据转 wiki.vault.delete 审计 |
| `listPages({vaultId,skip,take,lifecycle?,tier?,tag?,search?})` | tag 参数路由层未暴露（坑 6） | fs 手工扫描加过滤加分页；目录不存在返回空集（`wiki-service.ts:97`） |
| `getPage(id)` | 跨 vault 全量扫描定位（`wiki-service.ts:134-140`） | 命中时附加 vault 快照（`wiki-service.ts:138`）；全不中返回 null |
| `createPage(data)` | vault 存在校验（`wiki-service.ts:158-159`） | 默认值：provenance EXTRACTED、lifecycle DRAFT、tier SPECIALIZED、baseConfidence 0.5（`wiki-service.ts:170-173`）；filePath 由 slug 推导（`wiki-service.ts:177`）加 wiki.page.create 审计 |
| `updatePage(id, data)` | 先全量扫 vaults 定位（`wiki-service.ts:195-197`） | 全量展开合并（`wiki-service.ts:199`）加 wiki.page.update 审计；定位失败抛 NotFoundError（`wiki-service.ts:208`） |
| `deletePage(id)` | 物理删除单个文件（`wiki-service.ts:216`） | wiki.page.delete 审计；不回写 vault 计数（坑 2） |

## 数据流

vault 元数据走 store 标准读写（写 `wiki-vaults/<id>.json`）；page 走嵌套路径（写 `wiki-vaults/<vaultId>/pages/<pageId>.json`）；getPage、updatePage、deletePage 三个跨 vault 定位接口都先 list 全部 vaults 再逐个试读 pages 目录；deleteVault 走 fs 直删整个 vault 目录。审计方面 vault 与 page 的增删改共 5 个动作全部接了 recordAudit。

## 依赖与调用方

import 全集五项（`wiki-service.ts:1-5`）：store、fs 四函数 existsSync、readdirSync、rmSync、readFileSync，join，NotFoundError，recordAudit。fs 直用是它区别于其他 service 的标志。

反向依赖（全部调用点）：

| 调用方 | 函数 |
|--------|------|
| app/api/wiki/vaults/route.ts | listVaults、createVault |
| app/api/wiki/vaults/[id]/route.ts | getVault、updateVault、deleteVault |
| app/api/wiki/vaults/[id]/pages/route.ts | listPages、createPage |
| app/api/wiki/pages/[id]/route.ts | getPage、updatePage、deletePage |
| lib/__tests__/wiki-service.test.ts | createVault 等 |

数据面：写 wiki-vaults 目录下 vault 元数据与嵌套页面文件；deleteVault 额外做目录级递归删除。字段校验依赖路由层四个 wiki schema。

## 已知坑

1. **deleteVault 是物理删除，且硬编码数据根路径。** 递归删 pages 与 vault 目录（`wiki-service.ts:76-80`），路径写死 `join(process.cwd(), "data", ...)`——绕过了 store 的数据根解析（store 尊重 dataDirOverride，`store.ts:10-13`）。一旦部署或测试通过 override 改变数据根，deleteVault 仍去删默认 cwd 下的目录：轻则删空、重则误删。同时它与软删约定相反，误删不可恢复，只有一条审计记录可查。
2. **vault 统计字段是静态的，从不回写。** pageCount、avgConfidence、orphanCount 建库置 0（`wiki-service.ts:47-49`）后，createPage、deletePage、updatePage 均不更新 vault 文件；`_count.pages` 同样无人维护。运行时创建的 vault 这些字段恒 0，种子库里的值是静态快照。
3. **跨 vault 定位 page 靠全量扫描，page.vaultId 字段未被利用。** getPage、updatePage、deletePage 都先 list 全部 vaults 再逐个试读 pages 目录（`wiki-service.ts:134-140`、`wiki-service.ts:195-197`、`wiki-service.ts:213-215`）——page 记录里明明有 vaultId 字段（`wiki-service.ts:165`），但没有"先读 page 拿 vaultId 再直达"的索引路径。vault 数量线性增长时这三个接口线性变慢。
4. **listPages 抛裸 Error，绕过 AppError 体系。** JSON 解析失败时抛裸 Error（`wiki-service.ts:106`），而全链路错误映射只认 AppError（`errors.ts:72-82`），裸错误走兜底分支归为 500 且 message 原样透出——无法结构化区分"数据损坏"与其他内部错误。
5. **shared 为 false 的过滤不可达。** service 层写法支持布尔值（`wiki-service.ts:17`），但路由只把字符串 true 映射为 true、其余全部变 undefined（vaults 路由 `route.ts:11`）——"只看私有库"的查询无法通过 API 表达。
6. **listPages 的 tag 过滤是 service 层死参数。** 函数签名有 tag（`wiki-service.ts:116-118`），但唯一生产调用方 pages 路由只解析 lifecycle、tier、search 三个参数（pages 路由 `route.ts:11-15`）。
7. **updateVault 与 updatePage 全量展开，防线全在路由 schema。** 展开合并不做字段白名单（`wiki-service.ts:66`、`wiki-service.ts:199`）：当前安全依赖唯一调用方传 schema 校验后的数据，直调 service 的新代码可覆盖 id、createdAt 等任意字段。

## 排查路由

| 症状 | 去处 |
|------|------|
| 新建 vault 的页面数等统计一直显示 0 | `references/wiki-service-troubleshooting.md` |
| 按私有库过滤或按 tag 过滤没反应 | `references/wiki-service-troubleshooting.md` |
| 列表接口报 500 且错误信息带页面文件路径 | `references/wiki-service-troubleshooting.md` |
| 删除 vault 后数据目录整个消失 | `references/wiki-service-troubleshooting.md` |
