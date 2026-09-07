# API 接口说明（api-reference）

> 维护日期：2026-09-05 · 覆盖 `apps/web/app/api/` 全部 **34 个 route 文件**
> 实现约定以 `lib/utils.ts`（响应/校验）与 `lib/errors.ts`（错误体系）为准。

## 一、通用约定

### 响应格式

```jsonc
// 成功
{ "success": true, "data": { ... } }
// 失败
{ "success": false, "error": "可读错误信息", "code": "NOT_FOUND", "details": { ... } }
```

### 错误码与 HTTP 状态映射

| code | HTTP | 触发场景 |
|------|------|---------|
| `NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION` | 422 | Zod 校验失败 / 业务规则拒绝（如非法状态转移 NEW→RESOLVED） |
| `CONFLICT` | 409 | 重复审批、并发覆盖 |
| `AUTHORIZATION` | 403 | 权限不足（RBAC 预留） |
| `INTERNAL` | 500 / 502 / 503 / 504 | 未捕获错误 500；LLM 上游错误 502；LLM 未配置 503；LLM 超时 504 |

### Actor 上下文

请求头 `x-actor-id` / `x-actor-name` / `x-actor-role` 标识调用者（当前 MOCK 登录固定注入管理员）；
未携带时使用默认 actor。审计日志记录 actor。

### 分页

列表端点支持 `?page=1&pageSize=20`（pageSize ≤ 100），响应 `data` 含
`items` 与 `pagination: { page, pageSize, total, totalPages, hasMore }`。

---

## 二、Agent 域（11 route）

| 方法 | 端点 | 说明 |
|------|------|------|
| GET / POST | `/api/agents` | 列表（分页/过滤）/ 创建 |
| GET / PUT / DELETE | `/api/agents/[id]` | 详情 / 更新元信息 / 归档 |
| GET / PUT | `/api/agents/[id]/config/[partition]` | 四分区配置读写；partition ∈ `prompt\|knowledge\|tools\|routing`；PUT 走 Zod 校验并剥离未知键 |
| POST | `/api/agents/[id]/config/[partition]/rollback` | **分区级回滚**；body `{ versionId }` |
| GET | `/api/agents/[id]/versions` | 版本历史；发布满 7 天的版本懒计算 `effectivenessReport` |
| GET | `/api/agents/[id]/versions/[versionId]` | 单版本详情（含快照与效果报告）；跨 Agent 访问返回 422 |
| POST | `/api/agents/[id]/rollback/[versionId]` | 整版本回滚（覆盖 4 分区并生成新版本） |
| GET / POST / DELETE | `/api/agents/[id]/skills` | Skill 绑定列表 / 绑定 / 解绑 |
| POST / PUT | `/api/agents/[id]/release` | 提交发布（自动 diff + 真 SemVer）/ 更新待审 Release |
| GET / POST | `/api/agents/[id]/eval-cases` | 评测用例库：列表（按沉淀时间倒序）/ 从试聊 trace 沉淀（自动校验 trace 归属） |
| POST | `/api/agents/[id]/chat` | **Agent 试聊（真实 LLM）**，见第四节 |

## 三、发布 / Trace / Eval / 反馈 / Skills / Wiki / Settings / 其他（23 route，含 4 个 LLM 端点详见第四节）

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/releases` | 发布列表（status 过滤） |
| GET | `/api/releases/[id]` | Release 详情：`configSnapshot` + 上一版本 `baseline` |
| PUT | `/api/releases/[id]/review` | 审批：body `{ action: APPROVED\|REJECTED\|CHANGES_REQUESTED, reviewComment? }`；通过后生成不可变 Version |
| POST | `/api/releases/[id]/summary` | **AI 变更摘要（真实 LLM）**，见第四节 |
| POST | `/api/releases/[id]/ai-review` | **发布前 AI 评测（真实 LLM）**：仅 PENDING 可跑，快照 prompt 回放评测用例 + LLM 判官，结果写回 `release.aiReview`；见第四节 |
| GET / POST / PUT | `/api/feedback` | 反馈列表 / 创建 / 更新（状态机校验：NEW→TRIAGED→…→CLOSED，终态不可转） |
| POST | `/api/feedback/[id]/insight` | **AI 归因分析（真实 LLM）**，见第四节 |
| POST | `/api/traces/[id]/rate` | 试聊回复打分：body `{ rating: UP|DOWN, note? }`（可改分；trace 不存在 404） |
| DELETE | `/api/eval-cases/[id]` | 移除一条评测用例（同步审计日志） |
| GET / POST | `/api/skills` · GET / PUT / DELETE `/api/skills/[id]` | Skills CRUD |
| GET / POST | `/api/wiki/vaults` · GET / PUT / DELETE `/api/wiki/vaults/[id]` | Wiki Vault CRUD |
| GET / POST | `/api/wiki/vaults/[id]/pages` · GET / PUT / DELETE `/api/wiki/pages/[id]` | Wiki Page CRUD |
| GET / POST | `/api/settings/roles` · PUT / DELETE `/api/settings/roles/[id]` | 角色管理 |
| GET / POST | `/api/settings/permissions` | 权限管理 |
| GET / POST | `/api/settings/product-groups` | 产品组管理 |
| GET | `/api/settings/audit-logs` | 审计日志（append-only，只读） |
| GET | `/api/dashboard` | 工作台聚合统计 |
| POST | `/api/auth/login` | **MOCK 登录**（未接入真实认证；演示账号 `allengaller` / `123`） |

## 四、LLM 端点（真实调用小米 MiMo，5 个）

通用行为：凭据来自 `apps/web/.env`（`MIMO_API_KEY` 等）；未配置返回 **503**；
上游错误 **502**（details 含上游 status）；超时 **504**（默认 120s）。
成功响应 `data` 均含 `model` 与 `latencyMs`。

| 方法 | 端点 | 请求 | 响应 data |
|------|------|------|----------|
| GET | `/api/maas/probe` | — | `{ configured, model, baseUrl }`（不发真实请求） |
| POST | `/api/maas/probe` | — | `{ connected, model, reply, usage, latencyMs }` |
| POST | `/api/feedback/[id]/insight` | — | `{ feedbackId, insight, model, latencyMs }`；无状态不落库 |
| POST | `/api/releases/[id]/summary` | — | `{ releaseId, summary, model, latencyMs }`；无状态不落库 |
| POST | `/api/agents/[id]/chat` | `{ message: 1-4000 字, history?: [{role: user\|assistant, content}]（≤20 条） }` | `{ reply, model, usage, latencyMs, traceId }`；**回复同时落盘为 trace**（落盘失败不打断），前端据 `traceId` 提供 👍/👎 打分并可沉淀为评测用例；会话内容只存前端内存 |
| POST | `/api/releases/[id]/ai-review` | — | `release`（写回 `aiReview`：`status / runAt / model / totalCases / passed / failed / errorCases / summary / results[]`） |

试聊会以该 Agent **当前** Prompt 分区配置（systemPrompt + 角色定义 + 约束 + 输出格式）作为 system prompt——改完配置立即可验。

发布前 AI 评测只对 **PENDING** Release：以 `configSnapshot.prompt`（快照缺失时回退 Agent 当前 Prompt 配置）经同一组装函数回放该 Agent 全部 ACTIVE 评测用例，LLM 判官逐条对比参考回复输出 `{ verdict: PASS|FAIL, score, reason }`。全 PASS → PASSED；出现 FAIL/ERROR → FAILED；无评测用例或 LLM 未配置 → SKIPPED。结论写回 `release.aiReview`，仅供审批人参考，**不阻断审批**。

## 五、测试口径

全部 API 有 Vitest 集成测试（`app/api/__tests__/`，8 个文件，含 trace-eval-ai-review）：验证 status / body / 审计副作用；
LLM 端点统一 mock `global.fetch`，测试**绝不发真实请求、不消耗 tokens**。
