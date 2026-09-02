# 评测闭环三件套设计：Trace 证据链 + LLM 归因 + 重放评测门禁（P0+P1+P2）

> 日期：2026-08-31
> 状态：已批准（含 §11 代码核查补丁）
> 前置：[MiMo LLM 接入设计](./2026-08-25-mimo-llm-integration-design.md)（LLM 网关已交付）
> 依据：[Agent 自进化与持续改进行业调研](../../reports/2026-08-26-agent-self-evolution-and-continuous-improvement-industry-research.md) P0-P4 路线图

## 1. 背景与问题

平台当前的 L2 改进环（Feedback → 改配置 → Release → Version）存在三个断点：

1. **复盘无据**：试聊 Playground 是纯 prompt 调用，没有知识检索，更没有执行轨迹。Feedback 只有人工填写的文本与标签，归因靠拍脑袋。
2. **归因不落地**：`/api/feedback/[id]/insight` 已能做 LLM 归因分析，但无状态、不落库、无执行证据输入，也不回填 Feedback 的分区指向与标签。
3. **发布无门禁**：Release APPROVED 直接生成 Version，没有任何质量验证。改了配置不知道是变好还是变坏。

本设计一次性补齐三个断点，形成完整闭环叙事：

```
试聊（真实检索+LLM，全程留痕 Trace）──差评──▶ Feedback（自动关联 Trace）
                                                    │
                                    LLM 归因（读 Trace 证据，落库+一键回填分区/标签）
                                                    │
评测用例（种子 + 从负反馈一键转化）                ▼
        │                                        改配置
        ▼                                           │
    Release 提交 ──运行评测（候选配置重放+LLM 裁判）──▶ 门禁：分数<阈值 阻止 APPROVED
```

## 2. 范围与不做

**做**：
- P0：真实检索管道（BM25-lite over Wiki pages）+ 试聊全程 Trace 落库
- P1：归因升级（Trace 证据输入、结构化输出、落库、一键回填）
- P2：评测用例管理 + Release 候选配置重放评测 + 可配置硬门禁

**不做**（留后续）：
- Trace 的 OpenTelemetry 标准化导出
- 评测的异步任务队列/进度推送（同步执行，5-6 用例约 1-2 分钟，演示可接受）
- Wiki 内容按 Release 版本快照（重放用当前 Wiki，已知局限）
- Tools/MCP 真实调用（Tools 分区仍为配置展示；工具故障用例靠 prompt 约束近似验证）

## 3. 数据模型（JSON store 扩展）

沿用 `data/` 文件 store 模式，新增两个运行时目录（进 .gitignore）与既有实体的字段扩展。

### 3.1 Trace（新，`data/traces/<id>.json`，运行时不提交）

```jsonc
{
  "id": "trace-uuid",
  "agentId": "ecs-assistant",
  "kind": "CHAT_TURN",            // CHAT_TURN=试聊 | EVAL_CASE=评测重放
  "releaseId": null,              // EVAL_CASE 时所属 release
  "caseId": null,                 // EVAL_CASE 时所属用例
  "startedAt": "ISO", "finishedAt": "ISO",
  "input": { "message": "...", "historyTurns": 2 },
  "retrieval": {
    "query": "原始 query",
    "strategy": "HYBRID",
    "candidates": 4,              // 参与打分的页面总数
    "results": [                  // 按 score 降序，top maxWikiResults
      { "pageId": "page-ecs-ssh", "title": "...", "slug": "...",
        "score": 3.42, "confidence": 0.82, "excerpt": "前 400 字", "usedInContext": true }
    ],
    "belowThreshold": [/* 被阈值过滤的 pageId+score */],
    "fallbackTriggered": false    // 无命中且 fallbackToMcp=true 时 true
  },
  "prompt": { "systemPromptChars": 1834, "contextChars": 892, "knowledgePages": 2 },
  "llm": { "model": "mimo-v2.5-pro", "usage": {...}, "latencyMs": 8231 },
  "output": { "reply": "完整回复" },
  "feedbackId": null              // 关联反馈后回写
}
```

### 3.2 Feedback 扩展

- 新增可选 `traceId`：创建时可带（校验 trace 存在且属于同一 agent，否则 422），创建成功后回写 `trace.feedbackId`。**需要扩展 `createFeedbackSchema` 与 `createFeedback()`**（现状均不支持）。
- 新增可选 `attribution`（P1 落库）：

```jsonc
{
  "partition": "KNOWLEDGE", "rootCause": "…", "confidence": 0.8,
  "evidence": ["检索 top1 分数仅 0.31，低于阈值 0.6，触发 fallback"],
  "tags": ["KNOWLEDGE_GAP"], "suggestions": ["补充快照计费知识页"],
  "evidenceLevel": "TRACE_GROUNDED",  // TRACE_GROUNDED | TEXT_ONLY
  "model": "mimo-v2.5-pro", "latencyMs": 6123, "analyzedAt": "ISO"
}
```

**核查补丁**：`updateFeedbackSchema` / `updateFeedback()` 现状**不支持 `tags` 字段**（仅 status/severity/assignedTo/resolution/targetPartition/verificationNote），「一键回填标签」走不通。补丁：二者增加可选 `tags`（enum 白名单校验），tags 与状态机正交、不参与 `assertTransition`。

### 3.3 EvalCase（新，`data/eval-cases/<id>.json`，种子提交）

```jsonc
{
  "id": "ec-ssh-basic", "agentId": "ecs-assistant",
  "source": "SEED",               // SEED | FEEDBACK
  "feedbackId": null,             // FEEDBACK 来源时回链
  "title": "SSH 排查应引用知识库步骤",
  "input": "我的 ECS 实例突然 SSH 连不上了，帮我排查",
  "passCriteria": "按网络→安全组→SSH服务→密钥顺序给出排查步骤，提到安全组 22 端口",
  "expectedPartition": "KNOWLEDGE",
  "enabled": true, "createdAt": "ISO"
}
```

### 3.4 EvalRun（新，`data/eval-runs/<id>.json`，运行时不提交）

```jsonc
{
  "id": "run-uuid", "agentId": "...", "releaseId": "rel-...",
  "status": "COMPLETED",          // RUNNING | COMPLETED | SKIPPED | FAILED
  "triggeredBy": "user-id",
  "summary": {
    "total": 5, "passed": 4, "failed": 1, "errors": 0,
    "score": 80,                  // 用例均分，ERROR 计 0 分
    "threshold": 70,
    "gate": "PASSED"              // PASSED | FAILED | SKIPPED
  },
  "cases": [
    { "caseId": "...", "title": "...", "status": "PASS", "score": 85,
      "reason": "…", "traceId": "trace-...", "latencyMs": 9123 }
  ],
  "startedAt": "ISO", "finishedAt": "ISO"
}
```

### 3.5 Agent 扩展

新增可选 `evalConfig`（非分区，平台级设置）：`{ "enabled": true, "threshold": 70 }`，缺省视为 `{enabled:true, threshold:70}`。

## 4. P0：检索管道 + Trace

### 4.1 检索（新 `lib/services/retrieval-service.ts`）

- **分词**：中文按单字 + 相邻双字 bigram，拉丁按词；全小写。
- **打分**（BM25-lite）：title 命中权重 ×3，tags ×2，summary ×1，content ×0.5；词频饱和（`tf/(tf+1.2)`），query 覆盖率参与归一。
- **confidence**：检索分归一化到 0-1，与页面 `baseConfidence` 加权（0.6/0.4）。
- **过滤**：confidence < `knowledgeConfig.confidenceThreshold` 的不入上下文（记入 belowThreshold）；全部被滤掉且 `fallbackToMcp` → `fallbackTriggered=true`，知识上下文替换为显式标记「未命中知识库，以下回答基于通用知识，可能不可靠」，此标记是 KNOWLEDGE_GAP 归因的关键证据。
- **top-K**：`maxWikiResults`。

### 4.2 试聊改造（`/api/agents/[id]/chat`）

流程：检索（用 agent 当前 knowledgeConfig）→ 组装 system prompt（现有逻辑 + 知识上下文段）→ MiMo → 全程记 Trace 落库 → 响应增加 `traceId` 与 `retrieval` 摘要。会话历史仍只存前端，但**每轮**产生一条独立 Trace。

核查补丁：
- **prompt 组装抽共享函数**：chat 路由内联的 system prompt 组装逻辑抽为 `agent-runtime` 服务（`buildSystemPrompt` + `runAgentTurn`），评测重放复用同一实现，防两处漂移。
- **LLM 失败也落 Trace**：MiMo 调用抛错（超时/空回复/上游错误）时仍写 Trace（retrieval 完整、`llm.error` 记录错误摘要、output 为 null），供 LLM/工具故障归因回查；API 仍走 `handleApiError` 返回错误（此时前端拿不到 traceId，已知且可接受）。
- **无 knowledgeConfig / 未绑定 vault 的 agent**：检索结果为空、`fallbackTriggered=true` 且上下文标记「未绑定知识库」，不报错。

### 4.3 种子数据补全

现有 wiki 页面**没有 content 字段**（只有 title/summary/tags），检索与 grounding 无法成立。补全：ECS 3 页 + RDS 1 页补写 500-900 字正文；不新增页面——「知识缺口」用例选一个确实无页面的主题（如「预留实例券退款政策」）。

## 5. P1：归因升级（`POST /api/feedback/[id]/insight`）

- 读 feedback + traceId 关联的 Trace；无 Trace → `evidenceLevel=TEXT_ONLY`（提示词声明仅有文本）。
- 输入：反馈文本 + Trace 证据（query、各结果 score/confidence、belowThreshold、fallback 标记、回复摘录）。
- 输出：强制结构化 JSON（partition/rootCause/confidence/evidence/tags/suggestions），代码侧剥离 ```json 围栏后解析，解析失败返回 502 而非裸文本。
- **输出校验**（LLM 输出不可信，必须服务端把关）：`partition` 必须是 PROMPT/KNOWLEDGE/TOOLS/ROUTING 之一；`tags` 过滤到 FeedbackTag 白名单（非法项丢弃而非整单失败）；`confidence` clamp 到 [0,1]；`suggestions`/`evidence` 截断到合理长度。
- 落库：写 `feedback.attribution`；回写 `trace.feedbackId`；审计 `attribution.run`。
- 一键回填：前端按钮调既有 `PUT /api/feedback/[id]`，把 `attribution.partition` → `targetPartition`、`attribution.tags` 并入 `tags`（不覆盖人工已有标签）。
- **核查补丁（actor 上下文）**：现状 insight 路由未包 `withActor`，落库/审计会记到缺省 system。补丁：route 层改为 `withActor(resolveActor(request.headers), …)`，与 review 路由对齐。

## 6. P2：评测闭环与门禁

### 6.1 用例来源

- **种子**：ECS 5 条 + RDS 2 条，覆盖四个分区的典型故障模式 + 1 条「知识缺口应承认无把握而非编造」的幻觉防线用例。
- **反馈转化**：`POST /api/feedback/[id]/to-eval-case`——用 LLM 从负反馈生成 input+passCriteria（人工可改后保存），feedbackId 回链。

### 6.2 运行评测（`POST /api/eval/runs` `{releaseId}`）

- 对该 agent 全部 `enabled` 用例：以 **release.configSnapshot**（候选配置，非 agent 当前配置，防提交后漂移）重放——检索（候选 knowledgeConfig）+ LLM（候选 promptConfig 组装）。
- 每用例产生一条 `kind=EVAL_CASE` 的 Trace（复用 P0 管道，证据可回查）。
- **LLM 裁判**：单次调用，输入用例 input/passCriteria/Agent 回复/检索命中，输出 `{score:0-100, verdict, reason}`；解析失败该用例记 ERROR。
- 并发 3（对齐 ToolsConfig.maxConcurrentCalls 默认值），同步执行；每用例失败（超时/空回复/429）**重试 1 次**再记 ERROR。
- **资源上界**（防浏览器 fetch 超时）：重放回答 `maxCompletionTokens=1024 / timeoutMs=60_000`，裁判 `512 / 30_000`；种子 7 用例典型 1-3 分钟，UI 按钮明确提示耗时。
- `score` = 用例均分（ERROR 计 0）；`gate = score>=threshold ? PASSED : FAILED`。
- **LLM 未配置**：整个 run 记 `status=SKIPPED`、`gate=SKIPPED`（不阻塞演示，明确降级语义）。
- **系统性异常**：run 级抛错（如全部用例 ERROR）记 `status=FAILED`，`summary.error` 记原因，可重新运行。

### 6.3 门禁（改 `release-service.reviewRelease`）

APPROVED 动作时，若 `agent.evalConfig.enabled`（默认 true）：

| 评测状态 | 结果 |
|---|---|
| 无该 release 的 EvalRun | ConflictError：「评测门禁已开启：请先运行评测」 |
| gate=FAILED | ConflictError：附分数与阈值 |
| run.status=FAILED（系统性异常） | ConflictError：「评测运行异常，请重新运行」 |
| gate=SKIPPED | 放行，reviewComment 自动追加「评测跳过（LLM 未配置）」 |
| gate=PASSED | 放行 |

REJECTED / CHANGES_REQUESTED 不受门禁影响。回滚 Release（紧急恢复）不走门禁。

## 7. API 一览

| 方法/路径 | 说明 |
|---|---|
| `GET /api/traces?agentId=&limit=` | Trace 列表（时间倒序） |
| `GET /api/traces/[id]` | Trace 详情 |
| `POST /api/agents/[id]/chat` | 升级：检索+Trace，响应带 traceId/retrieval |
| `POST /api/feedback/[id]/insight` | 升级：Trace 证据归因+落库 |
| `POST /api/feedback/[id]/to-eval-case` | 新：负反馈→评测用例（LLM 生成草稿） |
| `GET/POST /api/eval/cases` | 用例列表/新建 |
| `PATCH/DELETE /api/eval/cases/[id]` | 启停/删除 |
| `POST /api/eval/runs` | 运行评测（同步） |
| `GET /api/eval/runs?releaseId=` | 该 release 的评测记录 |
| `PATCH /api/agents/[id]/eval-config` | 新：门禁开关/阈值编辑（不动通用 updateAgentSchema） |

## 8. 前端（全部嵌入现有页面，不加路由）

1. **Agent 详情 · 试聊区**：回复气泡下增加「检索命中 n · top 分数 x.xx」摘要与「轨迹详情」展开（检索表：页面/分数/置信度/是否入上下文 + prompt 统计）；新增「对此回复提反馈」内联小表单（标题/内容/评分），创建 Feedback 自动带 traceId。
2. **Feedback 列表**：展开区新增归因卡片——未分析显示「AI 归因」按钮；已分析显示分区/根因/置信度/证据/建议 +「一键回填」；有 traceId 时展示检索证据摘要。
3. **Releases 页**：PENDING 卡片新增评测区——用例数、「运行评测」按钮（含耗时提示）、最近一次 run 的总分+逐用例 PASS/FAIL 色点+gate 徽章、阈值行内编辑（写 agent.evalConfig）；审批被门禁拦截时展示后端 ConflictError 文案。

## 9. 测试（vitest，延续现有 232 项风格）

- retrieval：中文分词、权重衰减、阈值过滤、top-K、fallback 触发
- trace：落库/读取/形状、LLM 失败仍落 trace（llm.error）
- attribution（mock llm-service）：结构化解析、无 Trace 降级 TEXT_ONLY、落库与回写、围栏剥离、非法 partition/tags 的校验行为
- feedback：create 带 traceId（含跨 agent 校验）、update 支持 tags 合并
- eval（mock llm-service）：均分聚合、ERROR 计 0、SKIPPED 降级、FAILED 异常态、gate 三态、候选配置（release.configSnapshot）而非当前配置
- reviewRelease 门禁：无 run 拦截 / gate FAILED 拦截 / run SKIPPED 放行 / 关门禁放行 / run.status=FAILED 提示重试
- .gitignore 增加 data/traces、data/eval-runs（运行时产物不脏工作区；沿用既有幂等测试临时目录隔离机制）

## 10. 验收口径

1. 试聊一条 ECS 工单 → agent 详情可展开看到检索轨迹（含分数）→ 对回复提差评（自动带 traceId）。
2. 该反馈点「AI 归因」→ 输出引用检索证据的结构化归因并落库 →「一键回填」targetPartition/tags 生效。
3. 改坏 promptConfig（如删掉排查约束）→ 提交 Release → 运行评测出现 FAIL 用例 → 分数低于阈值时 APPROVED 被拦截并提示。
4. 未配置 MIMO_API_KEY 时：试聊报 503（既有行为）；评测 run 记 SKIPPED，审批放行且带跳过标记。
5. 全量测试通过；`data/traces`、`data/eval-runs` 不出现在 git status。

## 11. 代码核查补丁清单（2026-08-31，对照代码库逐项确认）

| # | 发现 | 补丁（已并入上文各节） |
|---|------|------------------------|
| 1 | `updateFeedbackSchema`/`updateFeedback()` 不支持 `tags`，一键回填标签走不通 | §3.2：schema+service 增加可选 `tags`（enum 白名单，不参与状态机） |
| 2 | `createFeedbackSchema`/`createFeedback()` 不支持 `traceId` | §3.2：创建校验 trace 存在且同 agent（否则 422），回写 `trace.feedbackId` |
| 3 | insight 路由未包 `withActor`，落库/审计会错记 system | §5：route 层补 `withActor(resolveActor(...))` |
| 4 | `.gitignore` 无 data/traces、data/eval-runs，运行会脏工作区 | §9：忽略两个运行时目录；eval-cases 种子提交、运行时新建为 untracked（与 feedback 既有行为一致） |
| 5 | MiMo 默认 timeout 120s + reasoning 慢，7 用例×2 次调用可能超浏览器容忍 | §6.2：重放 1024 tok/60s、裁判 512 tok/30s，并发 3，UI 提示 1-3 分钟 |
| 6 | LLM 空回复/429 抖动会整单失败 | §6.2：每用例重试 1 次再记 ERROR；ERROR 计 0 分 |
| 7 | LLM 调用失败时无 trace，LLM 故障类反馈无法归因 | §4.2：失败也落 trace（`llm.error`），API 仍走错误响应 |
| 8 | run 级系统性异常（如全部 ERROR）语义未定义 | §6.2/6.3：`status=FAILED`，门禁提示「请重新运行」 |
| 9 | `reviewRelease` 未加载 agent，拿不到 evalConfig | §6.3：门禁检查时读 agent（缺省视为 enabled=true/threshold=70） |
| 10 | chat 路由内联 prompt 组装与评测重放会两处漂移 | §4.2：抽 `agent-runtime` 共享 `buildSystemPrompt`/`runAgentTurn` |
| 11 | 种子 wiki 页 4 页全部没有 `content` 字段（已逐一确认），RAG 无法成立 | §4.3：补写正文；知识缺口用例选确实无页面的主题 |
| 12 | 无 knowledgeConfig/未绑 vault 的 agent 检索会空转 | §4.2：空结果+「未绑定知识库」标记，不报错 |
| 13 | LLM 归因输出不可信（partition/tags/confidence 可能非法） | §5：服务端白名单过滤 + clamp + 截断，非法 partition 返回 502 |
| 14 | 新增写操作缺审计 | §5/§6：`attribution.run`、`eval.run`、`eval.case.create` 入 audit |
