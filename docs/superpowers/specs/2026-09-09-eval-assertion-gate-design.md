# 评测确定性断言与发布门禁增强设计

> 状态：**Approved → Partially Implemented（R1+R2 已交付 2026-09-09，R3+R4 下一轮）** · 日期：2026-09-09
> 决策记录：D1 软门禁（FAILED 后批准须留痕，硬门禁留作 v2）；D2 断言类型集合 v1 = contains / not_contains / regex；D3 断言失败跳过 LLM 判官；D4 证据链放 Agent 详情页面板（R4 实施时生效）。
> 来源：[Better Harness 文章深度研究](../../evaluation/2026-09-09-better-harness-article-research.md) 第 4.2 节缺口清单的功能需求转换
> 上游依赖：评测闭环（2026-09-05 已交付：trace 落盘 → 打分 → 沉淀用例 → 发布前 AI 评测）

---

## 一、背景与目标

评测闭环交付后遗留两个经源码核实的缺口：

1. **判官只有 model-based 一种**：`EvalCase.expectation`（`eval-case-service.ts`）是自由文本，仅拼进判官 prompt；`apps/web/lib` 全域无确定性断言。Anthropic 评测方法论主张三判分器混合——「能用确定性判分就用确定性，LLM 判分保灵活，人工判分做校准」。硬约束（工单号必须出现、禁语不得出现）交给 LLM 判官既贵又可能误判。
2. **AI 评测无门禁效力**：`reviewRelease`（`release-service.ts`）完全不读 `release.aiReview`——AI 评测 FAILED 后仍可无理由 APPROVED，红线只存在于页面文案「仅供审批参考」。

另有两个 P1 缺口（成本度量 MOCK、无证据链视图）一并纳入，但优先级靠后。

**目标**：把「发布前 AI 评测」从参考信号升级为有确定性成分、有审批留痕约束的门禁依据，同时不改变「最终决定权在人」的设计哲学。

## 二、需求清单

### R1（P0）确定性断言：code-based 判分器

**需求**：评测用例支持可选的结构化断言；发布前 AI 评测先跑断言（零 LLM 成本、机器可信），断言全过再跑 LLM 判官；断言失败直接 FAIL，不调判官。

**数据模型**（`eval-case-service.ts` 的 `EvalCase` 增加可选字段）：

```ts
interface EvalAssertion {
  type: "contains" | "not_contains" | "regex";  // v1 三类，覆盖工单号/错误码/必填字段/禁语
  value: string;          // contains/not_contains 为关键词，regex 为正则
  description?: string;   // 展示用说明，如「回复须包含工单号」
}
interface EvalCase { /* 现有字段不变 */ assertions?: EvalAssertion[]; }
```

**落点**：

| 位置 | 改动 |
|------|------|
| `lib/schemas.ts` | `createEvalCaseSchema` 增加 `assertions` 可选数组（≤5 条，value ≤200 字符；regex 存入前 `new RegExp` 试编译，非法即 422） |
| `lib/services/eval-case-service.ts` | `createEvalCaseFromTrace` 透传断言 |
| `lib/services/ai-review-service.ts` | `evaluateCase` 内：replay 得到候选回复后先跑断言；任一失败 → `verdict: "FAIL"`、reason 为断言明细、**跳过判官调用**；全过 → 走现有判官流程。`AiReviewCaseResult` 增加可选 `assertions?: { type; value; passed; detail }[]` |
| `app/(dashboard)/agents/[id]/eval-case-panel.tsx` | 沉淀表单增加断言编辑（类型下拉 + 值 + 可选说明），可留空 |
| `app/(dashboard)/releases/page.tsx` | AI 评测结果块逐条显示断言结果（✓/✗ 徽标 + detail） |
| `apps/web/data/eval-cases/*.json` | 种子用例补断言示例：eval-ecs-001（SSH 排查）`contains: "systemctl"`；eval-ecs-002（磁盘扩容）`regex: "磁盘|扩容"` |
| `demo/mock-server.ts` | 镜像断言语义（演示形态 ai-review 至少一条用例展示断言 ✗ 场景） |

**验收标准**：

- 断言失败的用例不产生判官 LLM 调用（集成测试断言 fetch 调用次数减半）；
- 断言结果在评测结果块可见，FAIL 理由含具体断言明细而非「判官认为不好」；
- 无断言的旧用例行为与现状完全一致（向后兼容，存量 2 条种子用例不破坏）。

### R2（P0/P1）发布门禁 v1：FAILED 后批准必须留痕

**需求**：保持人工审批不变（LLM 判官会误判，最终决定权在人）；但 AI 评测 FAILED 的 Release，批准时**必须填写审批意见**，把「不看证据就批」变成「明示看过并担责」。

**落点**：

| 位置 | 改动 |
|------|------|
| `lib/services/release-service.ts` `reviewRelease` | `action === "APPROVED"` 且 `release.aiReview?.status === "FAILED"` 且 `!reviewComment?.trim()` → `ValidationError`（提示：AI 评测未通过，批准须填写审批意见说明理由） |
| 同上 | APPROVED 的审计 `review.approve` metadata 增记 `aiReviewStatus`（审批时点的评测结论快照，含 PASSED/FAILED/SKIPPED/未评测 null） |
| `app/(dashboard)/releases/page.tsx` | aiReview FAILED 的 PENDING 卡片：通过按钮旁提示「须填写意见」；未跑过评测时显示中性提示「尚未运行 AI 评测」 |

**验收标准**：FAILED + 空意见 APPROVED 返回 422（ValidationError），release 保持 PENDING；FAILED + 有意见 APPROVED 成功且审计含 `aiReviewStatus: "FAILED"`；PASSED/SKIPPED/未评测路径行为不变。

**开放决策**：v1 取软门禁（留痕）而非硬门禁（直接拒绝 APPROVED）。理由：判官误判风险已在 2026-09-05 交付报告声明；硬门禁可作 v2 配置项（`releaseGate: "advisory" | "blocking"`）另行立项。

### R3（P1）真实成本-效果度量：/maas 用量块 LIVE 化

**需求**：`/maas` 页「每 Agent 模型用量」从 MOCK 口径改为**读真实 trace 聚合**：试聊调用次数、tokens（`usage`）、平均时延（`latencyMs`）、👍/👎 比例。有真实数据标 LIVE，无数据保持 MOCK 并说明「尚无试聊数据」。

**落点**：新增 `GET /api/maas/usage`（聚合 `data/traces/` per-agent）；`/maas` 页用量块改读该端点；`demo/mock-server.ts` 镜像。

**诚实口径**：数据仅覆盖试聊 Playground 产生的 trace，不代表生产调用分布——页面保留该声明（对应研究报告中「不合成证据」原则）。

### R4（P1）任务证据链视图（只读）

**需求**：Agent 详情页新增「证据链」面板，把该 Agent 的证据节点按时间倒序串联，每节点显示时间 / 状态 / 关联 id 并可跳转：

> 反馈（含 AI 归因分区）→ 试聊 trace（打分 / 已沉淀用例）→ Release（AI 评测结论）→ Version（效果报告）→ 回滚记录

**落点**：新增 `GET /api/agents/[id]/evidence-chain`（纯聚合现有四类数据，无新存储）；Agent 详情页挂只读面板；面板底部固定声明「证据链呈现记录到的关联，非因果改进证明」（对标 Harness Inspector 的证据诚实声明）。

### R5（Backlog，本轮不做）

- 工单场景 org 指标代理（一次解决率、升级人工次数）——依赖 L1 会话数据回流（README 下一步第 2 项）；
- configSnapshot → 带跨版本变更历史的 Harness 资产版本化；
- 多渠道工单适配器（借鉴 Better Harness per-host adapter 模式，把反馈收集从 Chrome 插件单入口扩展为工单系统原生日志接入）。

## 三、不做的事（Non-goals)

- 不取消 / 阻断人工审批（门禁 v1 为留痕制）；
- 不引入外部评测框架（Promptfoo / Langfuse）；自研最小断言执行器即可满足三类断言；
- 不改动四分区数据结构与审批状态机本身。

## 四、测试与口径影响

- 集成测试在 `trace-eval-ai-review.test.ts` 基础上扩展：断言失败跳判官（fetch 次数）、regex 非法 422、FAILED 无意见 422 / 有意见通过、usage 聚合、evidence-chain 排序与空态；LLM 仍全 mock。
- 交付后按惯例先更新 `GTM/README.md` 事实口径表（测试数 / Zod schema 数 / route 文件数），再同步 01-04 物料与 W1 首页引用。

## 五、里程碑建议

| 轮次 | 内容 | 对应 roadmap |
|------|------|-------------|
| 本轮 | R1 + R2（断言 + 门禁留痕） | P1「Harness 纪律」评测子项 |
| 下一轮 | R3 + R4（真实用量 + 证据链视图） | P1 / P2 过渡 |
| Backlog | R5 | P2 / P3 |

## 六、开放决策（待确认后转 Approved）

| # | 决策 | 建议值 |
|---|------|--------|
| D1 | R2 软门禁 vs 硬门禁 | 软门禁（留痕）；硬门禁留作 v2 配置项 |
| D2 | R1 断言类型集合 v1 | contains / not_contains / regex 三类 |
| D3 | R1 断言失败是否跳过 LLM 判官 | 跳过（省一半调用成本，结果更可信） |
| D4 | R4 证据链放 Agent 详情页面板 vs 独立页面 | 详情页面板（与评测用例面板同级） |
