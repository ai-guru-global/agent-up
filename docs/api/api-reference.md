# API 接口说明（api-reference）

> 维护日期：2026-10-04 · 覆盖 `apps/web/app/api/` 全部 **40 个 route 文件**
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
| `AUTHORIZATION` | 403 | 权限不足（RBAC，2026-10-05 批3 起实际强制，见下节） |
| `INTERNAL` | 500 / 502 / 503 / 504 | 未捕获错误 500；LLM 上游错误 502；LLM 未配置 503；LLM 超时 504 |

### RBAC 写权限矩阵（批3，服务层强制）

写操作在服务层经 `requirePermission(resource, action)` 强制：actor.id → UserRole →
Role → RolePermission 解析（多角色并集，令牌里的 role 字符串仅作审计展示、**不作授权依据**）；
`system`（进程内自发动作）豁免；匿名/未知用户失败关闭。权限数据源即
`GET /api/settings/permissions` 与种子 `seed-data.mjs`。

| 操作 | 所需权限 |
|------|---------|
| Agent 创建/更新/归档、四分区配置更新、分区回滚 | `agent:write` |
| 提交发布、AI 评测 | `agent:publish` |
| 发布审批（通过/驳回/退回修改）、整版本回滚 | `release:approve` |
| 反馈创建 / 工单接入 / 状态流转 / 试聊评分沉淀前打分 | `feedback:write` |
| Wiki Vault / Page 增删改 | `wiki:write` |
| Skill 增删改（平台级资产） | `settings:admin` |
| Agent 绑定/解绑/启停 Skill、评测用例沉淀与删除 | `agent:write` |
| 角色 / 权限 / 产品组管理 | `settings:admin` |
| 审计日志查看 | `audit:read` |

**保持开放**（动作型/读型端点）：chat、MaaS probe、全部 GET 列表与详情、
知识检索、AI 评测结果查看。页面路由本身仍无守卫——授权只在服务层。
静态演示轨（demo/mock-server）无 RBAC（单管理员体验，两轨在 403 语义上分叉是已知口径）。

### Actor 上下文（身份与审计署名）

身份来源按优先级三选一，**不存在第四种**（实现见 `lib/context.ts` + `lib/auth-token.ts`）：

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1 | 签名会话令牌 | Cookie `agentup_session` 或请求头 `x-actor-token`，格式 `v1.<base64url payload>.<base64url sig>`，HMAC-SHA256 签名（密钥 `AUTH_SECRET`），`timingSafeEqual` 比对。**唯一不可伪造的来源**；由 `POST /api/auth/login` 下发 |
| 2 | 明文 `x-actor-id` / `x-actor-name` / `x-actor-role` | 仅在信任开关开启时采纳：`AUTH_TRUST_ACTOR_HEADERS=1` 强制开、`=0` 强制关、缺省则「非 production 开、production 关」。chrome-extension 与本地联调依赖此路径 |
| 3 | `anonymous` | 前两者都拿不到可信身份时的兜底，`role: "anonymous"`——**未认证绝不等于超管** |

关键语义：

- **令牌存在但校验失败 → 直接判匿名，绝不回落到明文头。** 令牌验不过意味着有人在伪造，此时采纳它自述的角色等于把伪造升级成提权。
- 令牌载荷必须含非空 `id` / `name` / `role` 且 `exp` 未过期（默认 TTL 24h，`AUTH_SESSION_TTL_HOURS` 可调）；签名有效但载荷非法同样判匿名。
- 未配 `AUTH_SECRET` 时登录仍返回 200，但 `data.sessionIssued === false` 且不下发 cookie，此后全部写操作的审计署名为 `anonymous`。**生产环境（`NODE_ENV=production`）则更进一步：`instrumentation.ts` 启动期校验失败会让进程退出**，因此线上运行中的服务必然已配置密钥；该降级路径仅存在于开发环境。
- 登出 `POST /api/auth/logout` 下发与签发属性逐字一致的清除 cookie（`Max-Age=0`），不校验令牌、总返回 200——登出必须幂等。
- `SYSTEM_ACTOR`（`role: "platform_admin"`）只用于**进程内自发动作**（后台重算、懒生成），不来自任何请求，无法被外部注入。

审计日志记录解析出的 actor；`AUTHORIZATION`(403) 错误码仍为 RBAC 预留——**当前 service 层不做权限判断**，令牌只解决「署名可信」，不解决「越权拦截」。

### 分页

列表端点支持 `?page=1&pageSize=20`（pageSize ≤ 100），响应 `data` 含
`items` 与 `pagination: { page, pageSize, total, totalPages, hasMore }`。

---

## 二、Agent 域（13 route）

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
| GET | `/api/agents/[id]/evidence-chain` | **任务证据链**（只读聚合，无新存储）：反馈 → 试聊 trace（含打分/沉淀用例）→ Release（AI 评测结论）→ Version（效果报告）→ 回滚审计，按时间倒序；响应固定携带 `declaration`（非因果改进证明） |
| GET | `/api/agents/[id]/version-lineage` | **资产演进线**（只读聚合，无新存储）：按 publishedAt 升序对相邻版本快照做结构化 diff（剥离 version/lastModifiedAt 元数据），输出每版本 `changedPartitions` 与分区级 added/removed/changed 计数；首个版本为基线（`changedPartitions: null`）；快照缺失按空对象计入 added |
| POST | `/api/agents/[id]/chat` | **Agent 试聊（真实 LLM）**，见第四节 |

## 三、发布 / Trace / Eval / 反馈 / Skills / Wiki / Settings / 其他（26 route，含 4 个 LLM 端点详见第四节）

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/releases` | 发布列表（status 过滤） |
| GET | `/api/releases/[id]` | Release 详情：`configSnapshot` + 上一版本 `baseline` |
| PUT | `/api/releases/[id]/review` | 审批：body `{ action: APPROVED\|REJECTED\|CHANGES_REQUESTED, reviewComment? }`；通过后生成不可变 Version |
| POST | `/api/releases/[id]/summary` | **AI 变更摘要（真实 LLM）**，见第四节 |
| POST | `/api/releases/[id]/ai-review` | **发布前 AI 评测（真实 LLM）**：仅 PENDING 可跑，快照 prompt 回放评测用例 + LLM 判官，结果写回 `release.aiReview`；见第四节 |
| GET / POST / PUT | `/api/feedback` | 反馈列表 / 创建 / 更新（状态机校验：NEW→TRIAGED→…→CLOSED，终态不可转） |
| POST | `/api/feedback/ingest` | **多渠道工单接入（R5b）**：机器到机器反馈入口，按 `channel` 适配器规范化 payload（`generic` 直映射 / `ticket-webhook` 工单 subject+priority→severity），记 `source` 与 `externalRef`；同渠道同外部单号重复接入 → 409（幂等） |
| POST | `/api/feedback/[id]/insight` | **AI 归因分析（真实 LLM）**，见第四节 |
| POST | `/api/traces/[id]/rate` | 试聊回复打分：body `{ rating: UP|DOWN, note? }`（可改分；trace 不存在 404） |
| DELETE | `/api/eval-cases/[id]` | 移除一条评测用例（同步审计日志） |
| GET / POST | `/api/skills` · GET / PUT / DELETE `/api/skills/[id]` | Skills CRUD |
| GET / POST | `/api/wiki/vaults` · GET / PUT / DELETE `/api/wiki/vaults/[id]` | Wiki Vault CRUD |
| GET / POST | `/api/wiki/vaults/[id]/pages` · GET / PUT / DELETE `/api/wiki/pages/[id]` | Wiki Page CRUD |
| GET | `/api/wiki/vaults/[id]/search` | **Vault 内知识检索（BM25-lite，retrieval-service 生产接线）**：query `q` 必填 / `limit` 1-20 默认 5 / `threshold` 0-1 默认 0.35；零分候选（与查询无词面重叠）不入 `results`；返回 `results`（score / confidence / excerpt / usedInContext）与 `belowThreshold`、`fallbackTriggered`；vault 不存在 404，参数不合法 422 |
| GET / POST | `/api/settings/roles` · PUT / DELETE `/api/settings/roles/[id]` | 角色管理 |
| GET / POST | `/api/settings/permissions` | 权限管理 |
| GET / POST | `/api/settings/product-groups` | 产品组管理 |
| GET | `/api/settings/audit-logs` | 审计日志（append-only，只读） |
| GET | `/api/dashboard` | 工作台聚合统计 |
| GET | `/api/maas/usage` | **MaaS 每 Agent 真实用量**（只读聚合）：按 traces 汇总调用次数/tokens/平均时延/👍👎，按调用次数降序；`hasData=false` 时页面回退 mock 口径（仅覆盖试聊 Playground trace，非生产分布） |
| POST | `/api/auth/login` | **MOCK 登录**（演示账号 `allengaller` / `123`，凭据硬编码、未接入真实用户库）。成功时下发签名会话令牌：`Set-Cookie: agentup_session=…; HttpOnly; SameSite=Lax`（生产追加 `Secure`），响应 `data` 含 `sessionIssued`——为 `false` 表示 `AUTH_SECRET` 未配置，登录成功但无会话，后续写操作署名为 `anonymous`。口令错误 401 |
| POST | `/api/auth/logout` | **登出**：下发 `Set-Cookie: agentup_session=; Max-Age=0`（其余属性与签发时逐字一致，否则浏览器会当成另一枚新 cookie，原来那枚照样留着）。**不校验令牌、不查库、总返回 200**——登出必须幂等：令牌已过期或签名非法时把它清掉同样是正确结果，若在此返回 401，前端会卡进「本地存着 cookie 但服务端不认」的状态。cookie 是 HttpOnly 的，客户端无法自行删除，因此这是唯一的登出路径。响应 `data` 为 `{ loggedOut: true }` |

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

全部 API 有 Vitest 集成测试（`app/api/__tests__/`，18 个文件，含 trace-eval-ai-review / maas-usage / evidence-chain / wiki-search）：验证 status / body / 审计副作用；
LLM 端点统一 mock `global.fetch`，测试**绝不发真实请求、不消耗 tokens**。
