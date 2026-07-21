# 实施方案：P0 稳定层 + 全面测试覆盖（最佳实践高质量输出）

## 范围（基于你的选择）
聚焦「P0 稳定层」——**不换存储层、不引外部依赖（无 Prisma/Postgres/NextAuth）、不破坏现有 JSON 种子数据**。在现有架构上用工程纪律把质量拉满，并做到**全面测试覆盖**。所有改动都是纯增量或原地加固，UI 零回归。

## 探查确认的关键缺陷（已读真实代码核实）

1. **审计日志完全没写入**：`data/settings/audit-logs.json` 只有种子数据，全代码库**零个写审计的服务**；`recordConfigChange` 写的是另一个 `config-changes/` 集合，且 `changedBy` 硬编码 `"system"`。
2. **释放快照 diff 逻辑错误**：`submitRelease` 把 `changedPartitions` 算成「配置存在就算改动」（4 个全 true），且 `configSnapshot` 即使没改也会 snapshot；`rel-001.json` 种子 `configSnapshot: null` 却 APPROVED——种子与代码矛盾。
3. **语义化版本是假的**：`createVersionFromRelease` major/patch 硬编码 0，只递增 minor；无 patch/回归逻辑。
4. **release 审批路由有真 bug**：`api/agents/[id]/release/route.ts` PUT 用 `body as {...}` 绕过刚校验过的 `parsed.data`，且 path `id` 参数被 `await params` 丢弃（该端点其实是 `/api/releases/[id]/review` 的重复）。
5. **校验覆盖参差**：skills 的 schema 内联在 route 里（漂移源）；wiki vault/page、role、permission、product-group 的 POST/PUT **零校验**（`parseBody<Record<string,unknown>>` 直传）；`reviewReleaseSchema` 缺 `releaseId`。
6. **错误处理粗糙**：throw → 字符串 → 500，靠 `includes("不存在")` 字符串匹配判 404；无错误码、无结构化错误。
7. **store 同步 I/O 阻塞事件循环**，无错误处理，`JSON.parse` 失败直接 500；ID 用非加密 `Math.random`。
8. **类型已漂移**：`@agent-up/shared` 是依赖但代码里**零 import**，服务用本地 inline 类型。

---

## 实施计划（按依赖排序）

### 阶段 1 · 基础设施层（先打底，后续都依赖它）

**1.1 错误体系** — 新建 `lib/errors.ts`
- `AppError` 基类 + 子类 `NotFoundError`/`ValidationError`/`ConflictError`/`AuthorizationError`，各带 HTTP status。
- 改造 `lib/utils.ts` 的 `error()`，新增 `handleApiError(err)` 把 `AppError` 映射成正确 status + 结构化 `{ error, code, details? }`；未知错误 → 500 + 日志。

**1.2 统一 actor 上下文** — 新建 `lib/context.ts`
- `RequestContext { actor: { id, name, role } }`，从请求头 `x-actor-id/name/role` 解析（为将来接 NextAuth 留接口，现在默认 `"system"` 但**所有写操作都经过它**，不再散落硬编码）。
- `getActor()` / `withContext()` 帮助函数。

**1.3 审计日志服务** — 新建 `lib/services/audit-service.ts`
- `recordAudit(action, resource, resourceId, details)`：append-only 写入 `data/settings/audit-logs.json`，actor 从 context 取，带 `createdAt`/`id`（用 crypto.randomUUID）。
- 兼容现有种子数据结构（`{id, action, resource, resourceId, userName, userRole, createdAt, details}`）。

### 阶段 2 · 校验全面化

**2.1 扩充 `lib/schemas.ts`**（补齐所有缺失 schema，全部带中文错误信息）
- `createSkillSchema` / `updateSkillSchema`（从 route 内联迁出 + 强化：category/runtime 枚举、endpoint URL 校验）。
- `createWikiVaultSchema` / `updateWikiVaultSchema`、`createWikiPageSchema` / `updateWikiPageSchema`。
- `createRoleSchema` / `updateRoleSchema`、`createPermissionSchema`、`createProductGroupSchema`。
- `bindSkillSchema`（`{skillId, config?}`）、`reviewReleaseSchema` 补 `releaseId: z.string().min(1)`。
- 导出所有 `z.infer` 类型。

**2.2 校验中间件 helper** — 在 `lib/utils.ts` 加 `validateBody<T>(request, schema): Promise<{data} | NextResponse>`，消除每个 route 的重复 `safeParse` 样板。

### 阶段 3 · 核心业务逻辑修复（修真 bug，带测试）

**3.1 释放快照 diff 重写**（`release-service.ts`）
- `submitRelease`：`changedPartitions` 改为**与上一个已发布 Version 的 snapshot 对比**（用 `computeJsonDiff`），没改动的分区不算；若 4 个分区都没变，抛 `ValidationError("没有任何配置变更，无法提交发布")`。
- `configSnapshot` 始终写入（修复种子矛盾）。
- 审计：submit 时记 `release.submit`，review 时记 `release.approve/reject/changes_requested`。

**3.2 语义化版本正确实现**（`createVersionFromRelease`）
- 提取 `bumpVersion(current, changedPartitions)`：首次 → `0.1.0`；之后按分区变更范围——单分区小改 patch、多分区 minor、重大（含路由/全分区）major。带显式规则常量表。
- 写到 `lib/versioning.ts` 独立模块（便于单测）。

**3.3 release 审批路由修复**（`api/agents/[id]/release/route.ts`）
- PUT 用 `parsed.data`（含 `releaseId`），不再 `body as`；标记该端点为已废弃（建议用 `/api/releases/[id]/review`），但保持向后兼容。

**3.4 反馈状态机校验**（`feedback-service.ts`）
- `updateFeedback` 加合法状态转移表（`NEW→TRIAGED→ASSIGNED→IN_PROGRESS→RESOLVED→VERIFIED→CLOSED`，`WONTFIX` 终态），非法跳转抛 `ValidationError`。

**3.5 全 service 接 actor + 审计**
- agent-service（create/update/delete/config-change）、release、feedback、skill、wiki：所有写操作 `recordAudit`，actor 从 context。

### 阶段 4 · store 加固（不换实现，只补安全网）

**4.1 `lib/data/store.ts`**
- `generateId` 改 `crypto.randomUUID()`（保留旧 ID 兼容）。
- `readJson` 包 `try/catch`，损坏文件抛结构化 `AppError("数据损坏", 500)` 而非裸 `SyntaxError`。
- 移除两处 dead code（未用的 `dir` 局部变量）。
- **不改同步 I/O**（标注 TODO 注释 + 在 P0 文档说明，留待 Prisma 迁移）。

### 阶段 5 · 全面测试覆盖（你选了「全面覆盖」）

**5.1 测试基建**
- 确认 `vitest.config.ts`（若无则建），配置 `alias: { '@': path }`、`environment: node`、coverage 阈值（service/util ≥ 85%）。
- 新建 `lib/__tests__/helpers/`：内存版 `MockStore`（`vi.spyOn(store,...)` + 临时目录隔离，每个 test 独立 fixture，不污染 `data/` 种子）。

**5.2 单元测试（新增，目标覆盖改动点）**
- `versioning.test.ts`：`bumpVersion` 全路径（首次/单分区/多分区/全分区/边界）。
- `diff.test.ts`：已有，补充嵌套深比较用例。
- `errors.test.ts`：`AppError` 子类 status 映射、`handleApiError`。
- `schemas.test.ts`：每个新 schema 的 happy path + 失败 path（枚举、范围、必填）。
- `audit-service.test.ts`：append 正确性、actor 注入、结构兼容种子。
- `release-service.test.ts`：submit diff 逻辑、无变更报错、APPROVED 生成 version、REJECTED 不生成、重复审批报 ConflictError、审计写入。
- `feedback-service.test.ts`：合法/非法状态转移、resolvedAt/verifiedAt 时序。
- `agent-service.test.ts`：config 分区 version 递增、recordConfigChange diff、审计。
- `store.test.ts`：readJson 损坏文件抛 AppError、generateId 唯一性、writeArray 往返。

**5.3 API 集成测试（mock store）**
- `app/api/__tests__/`：agents、releases（含 `/[id]/review`）、feedback、skills、wiki、settings、dashboard、auth 的 route handler 测试——构造 `NextRequest`，断言 status + body + **审计副作用**。

### 阶段 6 · 文档与验证

- 更新 `docs/evaluation/...md` 的 P0 状态表（勾选已完成项）。
- 在 `/architecture/roadmap` 页面把 P0 改进项标记为「已完成」（Pill tone="good"）。
- `README.md` 补「测试」一节。
- 验证：`pnpm --filter web build` + `pnpm --filter web test --coverage` 全绿 + 手动跑关键 API（curl 冒烟）+ 截图 roadmap 页更新。

---

## 不做（明确边界）
- ❌ 不接 Prisma/Postgres（避免存储层大改 + docker 依赖 + 种子结构分歧的高风险）
- ❌ 不接 NextAuth（用 `x-actor-*` 头的轻量 context 占位，为将来留接口；真正鉴权是单独工程）
- ❌ 不改 UI 页面（零回归），仅改 `/architecture/roadmap` 的标记 Pill
- ❌ 不改同步 I/O（标注 TODO，留给 Prisma 迁移）
- ❌ 不动 `@agent-up/shared`（漂移问题记录在文档，不在本轮重构类型源）

## 交付清单（预计 ~25 个文件）
- 新建：`lib/errors.ts`、`lib/context.ts`、`lib/versioning.ts`、`lib/services/audit-service.ts`、`vitest.config.ts`、`lib/__tests__/helpers/mock-store.ts`、~12 个测试文件、`app/api/__tests__/*.test.ts`
- 修改：`lib/utils.ts`、`lib/schemas.ts`、`lib/data/store.ts`、5 个 service、所有 API route（接 handleApiError + validateBody + actor）、`roadmap/page.tsx`、`README.md`、evaluation doc

## 验证标准
- `pnpm --filter web build` 通过
- `pnpm --filter web test --coverage` 全绿，service/util 覆盖率 ≥ 85%
- 现有 4 个 architecture 页面 + 所有业务页面 UI 无回归（截图确认）
- 关键 API curl 冒烟通过（含审计日志写入验证）