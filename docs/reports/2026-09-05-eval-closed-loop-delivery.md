# 评测闭环交付报告（W2：trace → 打分 → 沉淀 → 发布前 AI 评测）

> 交付日期：2026-09-05 · 验收：lint 0 problems · 测试 251/251（22 文件）· 覆盖率 Statements 95.9% / Branches 79.9% / Functions 90.9%
> 对应路线图：「本轮已完成 · 评测闭环（2026-09-05）」（roadmap 页）与 P2「失败工单 → 评测集（Golden Set）」的手动版落地。

## 一、背景与决策

上一轮交付（MiMo LLM 接入，2026-08-25）解决了「试聊可用」，但改进闭环缺最后一块证据链：
改配置后**上线前不知道会不会更差**——审批人只能盲批（对应 2026-07-31 行业差距分析中的「无回归评测」）。

本轮把「评测集回放」愿景落地为最小可用闭环，五个设计决策：

1. **trace 从 chat 端点自然产生**：试聊成功回复即在服务端落盘 `data/traces/{id}.json`；
   `recordTrace` 失败返回 null、绝不打断对话主流程（trace 是副产品，不是依赖）。
2. **打分可改分**：`POST /api/traces/[id]/rate` 支持 `UP|DOWN`，同一 trace 重复打分即覆盖
   （演示现场常先 👍 后改 👎），写 `ratedAt/note` 并审计 `trace.rate`。
3. **沉淀即评测用例**：`POST /api/agents/[id]/eval-cases` 从 trace 生成用例（校验 trace 存在且
   属于该 Agent，跨 Agent 422）；用例含**完整输入 + 参考回复**——参考回复是判官对照的锚点，
   这正是「修复 N 张 / 回归 0 张」的语料基础。期望行为（expectation）可选，缺省给通用兜底文案。
4. **发布前评测用「快照」不用「当前配置」**：replay 组装 system prompt 时取
   `release.configSnapshot.prompt`（缺失才回退 Agent 当前 Prompt 配置），与 Playground 共用
   `buildSystemPrompt`——保证「审批人看到的就是要评测的版本」，且「评测时的行为 == 试聊时的行为」。
5. **结论仅供参考、不阻断审批**：LLM 判官逐条输出 `{verdict, score, reason}`；
   全 PASS → PASSED；有 FAIL/ERROR → FAILED；无用例或 LLM 未配置 → SKIPPED。
   门禁是「给审批人看证据」，不是替审批人做决定。

## 二、交付内容

### 数据层（JSON store 新增两个目录）

| 数据 | 形状 | 关键字段 |
|------|------|---------|
| `data/traces/{id}.json` | TraceRecord | agentId / systemPrompt / history / message / reply / model / usage / latencyMs / rating / ratedAt / note |
| `data/eval-cases/{id}.json` | EvalCase | agentId / sourceTraceId / title / expectation / systemPrompt / history / message / referenceReply / status: ACTIVE |

种子评测用例 2 条（`eval-ecs-001` SSH 排查、`eval-ecs-002` 磁盘扩容），
呼应 `ecs-assistant` 的 PENDING Release（rel-002，configSnapshot 无 prompt）与磁盘扩容改提示快照的变更。

### API（4 个新 route，全量 Zod 校验 + 审计）

| 端点 | 行为 |
|------|------|
| `POST /api/traces/[id]/rate` | 打分（UP/DOWN，可覆盖；trace 不存在 404） |
| `GET/POST /api/agents/[id]/eval-cases` | 用例列表（沉淀时间倒序）/ 沉淀（trace 归属校验，422） |
| `DELETE /api/eval-cases/[id]` | 移除用例（审计 `eval_case.delete`） |
| `POST /api/releases/[id]/ai-review` | 发布前 AI 评测（仅 PENDING，否则 409；写回 `release.aiReview`） |

`chat` 端点响应新增 `traceId` 字段（落盘失败时为 null，前端据此隐藏打分按钮）。

### 前端

- **Playground**：assistant 气泡内「有帮助 / 需改进」打分按钮（当前分数高亮），
  已打分未沉淀时出现「沉淀为评测用例」→ 行内展开期望行为表单；操作区整体标记
  `data-chat-actions`（chrome-extension 反馈收集器提取对话证据时剔除，防 UI 文案混入证据）。
- **Agent 详情页**：消息列表下挂载「评测用例」面板（标题/期望/沉淀时间/移除）。
- **Releases 页**：PENDING 卡片「AI 评测」按钮 → 结果块（状态徽标 通过/未通过/已跳过、
  通过 x/y、逐条 verdict + reason + score），Hint 说明「仅供审批参考」。

### 演示形态（demo mock-server 同形状同步）

chat 落盘 trace 并返回 traceId；traces rate / eval-cases GET+POST+DELETE / releases ai-review
均有镜像分支（ai-review 固定 PASSED 或 SKIPPED，audit 照写），静态 Demo 可完整演示闭环。

## 三、测试与验证

- 新增集成测试 `app/api/__tests__/trace-eval-ai-review.test.ts`（10 条）：
  chat 落盘 → 打分覆盖 / 422 / 404 → 沉淀 201（含审计）/ 404 / 422 → 删除 →
  ai-review PASSED（**断言快照 prompt 生效**：replay system 含新提示词、不含旧提示词）/
  FAILED / 无用例 SKIPPED / 未配置 SKIPPED（fetch 零调用）/ APPROVED 409 + ghost 404。
- 全量：**251/251（22 文件）**；覆盖率 Statements 95.9% / Branches 79.9% / Functions 90.9%。
- LLM 全 mock `global.fetch`（按 judge user 含「## 候选回复」分流），绝不发真实请求。

## 四、口径变更（2026-09-05 起）

| 口径 | 变更前 | 变更后 |
|------|--------|--------|
| 测试数 | 241（21 文件 / 77 API 集成） | 251（22 文件 / 87 API 集成） |
| 语句覆盖 | 96.5% | 95.9%（新增 10 条测试后实测） |
| API route 文件 | 30 | 34 |
| Zod schema | 23 | 25（+ rateTraceSchema / createEvalCaseSchema） |
| 真实 LLM 集成点 | 4 | 5（+ 发布前 AI 评测） |

## 五、踩坑记录（可复用经验）

1. **编辑工具假失败**：批量文本替换工具多次报「content does not match」但实际已写入。
   对策：报错后先 grep/python 核验实际状态再重试，勿盲目重试造成重复内容。
2. **覆盖率阈值与口径**：新增测试后语句覆盖从 96.5% 微降到 95.9%（分母变大），属正常；
   文档同步必须用实测值而非旧值（曾出现凭记忆写 96.5% 的风险点）。
3. **空 content 防御**：判官 JSON 解析先剥离 ```json 围栏、截取首 `{` 至末 `}`，
   score clamp 1-5——LLM 输出格式漂移不打断整轮评测（单条记为 ERROR 继续）。
4. **会话隔离**：沉淀用的 trace 必须含完整 systemPrompt 快照（不是引 agent 当前配置），
   否则历史用例会随配置漂移（用例「当时的行为」不可复现）。

## 六、文件清单

| 文件 | 说明 |
|------|------|
| `apps/web/lib/services/trace-service.ts` | trace 落盘 + 打分（失败返回 null 不抛） |
| `apps/web/lib/services/eval-case-service.ts` | 用例列表 / 沉淀（归属校验）/ 删除 |
| `apps/web/lib/services/prompt-builder.ts` | buildSystemPrompt 四分区组装（Playground 与评测共用） |
| `apps/web/lib/services/ai-review-service.ts` | runAiReview：PENDING 校验 / 快照回放 / 判官 / 汇总写回 |
| `apps/web/app/api/traces/[id]/rate/route.ts` · `agents/[id]/eval-cases/route.ts` · `eval-cases/[id]/route.ts` · `releases/[id]/ai-review/route.ts` | 4 个新端点 |
| `apps/web/app/api/agents/[id]/chat/route.ts` | 改造：落盘 trace + 响应 traceId |
| `apps/web/app/(dashboard)/agents/[id]/agent-detail.tsx` + `eval-case-panel.tsx` | Playground 打分/沉淀 + 用例面板 |
| `apps/web/app/(dashboard)/releases/page.tsx` | AI 评测按钮 + 结果块 |
| `apps/web/demo/mock-server.ts` + `seed.ts` | 演示形态同形状端点 + traces/evalCases 态 |
| `apps/web/data/eval-cases/*.json` | 2 条 ECS 种子用例 |
| `apps/web/app/api/__tests__/trace-eval-ai-review.test.ts` | 10 条闭环集成测试 |

## 七、下一里程碑

- **自动沉淀 + 自动门禁**：L1 会话结束自动抽取用例；Release 提交时自动触发评测（当前为手动按钮）。
- **失败用例回流**：FAILED 用例自动生成「配置修改建议」草稿（对应 P2「加强闭环」）。
- **评测历史**：跨 Release 对比同一用例的 verdict 变化（防回归视图）。
