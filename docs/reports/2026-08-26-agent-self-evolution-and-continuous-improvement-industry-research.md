# Agent 自进化与持续改进领域行业调研报告

> 报告日期：2026-08-26
> 报告类型：行业调研 / 理论综述 / 案例对比 / AgentUp 落地建议
> 前序文档：
> - [MVP 设计文档](../superpowers/specs/2026-07-06-agent-improvement-platform-mvp-design.md)（三层 Loop / 四分区 / Release→Version）
> - [2026-07-21 项目评估与 Harness/Loop 工程参考](../evaluation/2026-07-21-project-evaluation-and-harness-loop-reference.md)
> - [2026-07-31 项目整体评估与行业差距分析](./2026-07-31-project-evaluation-and-industry-gap-analysis.md)
> 对应外部页面：`/architecture/loop`（三层 Loop）、`/architecture/harness`（Harness 工程参考）

---

## 摘要（TL;DR）

1. **核心范式已收敛**：业界主流 Agent 运行环已收敛为同一个骨架——"LLM + 工具 + 环境反馈"的 while 循环（ReAct 是其学术原型，Anthropic 的 while+tools、OpenAI Agents SDK 的 Runner、LangChain 的 AgentExecutor 都是其工程化变体）。差异不在循环本身，而在**终止判定、预算护栏与上下文管理**三件事上。
2. **Harness 正在成为独立工程学科**："模型能力之外的全部脚手架"（循环控制、上下文工程、记忆、权限、可观测性、评估）被统称为 Harness，且正在被产品化——版本控制、灰度发布、自动化评估、可观测性是其四大支柱。Anthropic 的长时任务 harness（initializer agent + 进度文件 + feature list + git 回滚）是目前最完整的公开实践。
3. **分层改进模型与 AgentUp 三层 Loop 高度同构**：L1 运行时自修正（Reflexion 类）、L2 配置级改进（eval-driven development + prompt 优化器如 GEPA）、L3 跨 Agent 进化（Voyager 技能库、自进化 Agent 综述的 model/context/system 三级分类）。AgentUp 的 L1/L2/L3 划分与学术 taxonomy 对得上，属于"概念领先、引擎缺位"。
4. **行业标杆的共同短板**恰是 AgentUp 的机会点：Trace 证据链（尤其检索轨迹）、根因归因自动化、"失败 → 评测集"的自动沉淀、发布前回放验证（闭环）。LangSmith/Braintrust 提供了组件，但**把四件事串成"工单复盘 → 语料加强 → 回归验证"闭环的产品，市面上尚无现成方案**。
5. **落地路径**：先补证据链与归因（P0/P1），再补评测集与发布门禁（P2），工程债（鉴权/数据库/沙箱）按使用规模触发升级（P3），L3 进化层以"知识蒸馏 + 跨 Agent 共性发现"为远期主线，不急于做模型级自进化。

---

## 一、理论综述：Agent 持续改进的基本框架

### 1.1 从 Prompt Engineering 到 Harness Engineering 的范式迁移

业界对"如何让 Agent 持续变好"的认知经历了三次迁移：

| 阶段 | 核心信念 | 改进对象 | 代表言论 |
|------|---------|---------|---------|
| Prompt Engineering | 好提示词 = 好 Agent | 系统提示词 | 早期 LangChain 实践 |
| Context Engineering | 好上下文 = 好行为 | 模型每一步看到的全部内容 | Manus："模型进步是潮水，我们想做船而不是钉死在海床上的柱子"——用上下文工程换取"小时级"迭代，与底层模型正交 |
| Harness Engineering | 好脚手架 = 可靠、可进化 | 循环控制 + 上下文 + 记忆 + 工具 + 权限 + 观测 + 评估 | Anthropic 长时任务 harness；arXiv《A Survey on Agent System and Harness Design》明确提出 "prompt → context → harness" 的演进主线 |

关键推论：**Agent 的持续改进能力，不取决于单次提示词调优的水平，而取决于 Harness 是否把"观察 → 归因 → 修改 → 验证 → 发布 → 回滚"做成了可重复执行的流水线。** 这正是 AgentUp 的产品本质——"把 Harness 工程纪律产品化给业务团队"。

### 1.2 三个时间尺度的改进环（与 AgentUp L1/L2/L3 同构）

学术界（《A Survey of Self-Evolving Agents》, arXiv:2507.21046）将自进化 Agent 组织为三个基础问题：

- **What（进化什么）**：模型参数 / 上下文（提示词、记忆、知识、工具）/ 系统架构（多 Agent 拓扑、流程）；
- **When（何时进化）**：运行时即时进化（in-loop）vs 任务后离线进化（post-loop）；
- **How（如何进化）**：基于反馈的优化（RL、反思、遗传式提示词进化）与知识沉淀（技能库、记忆蒸馏）。

映射到 AgentUp 的三层 Loop：

| AgentUp 概念 | 时间尺度 | 学术对应 | 行业实现成熟度 |
|-------------|---------|---------|--------------|
| L1 即时交互环 | 分钟级 | in-loop self-correction（Reflexion、错误保留、recitation） | 高（Manus/Claude Code 均有成熟实践） |
| L2 产品改进环 | 小时～天级 | eval-driven development + 配置级优化（DSPy/GEPA） | 中高（平台组件成熟，闭环产品缺位） |
| L3 智能进化环 | 天～周级 | system-level evolution、skill library、knowledge distillation | 低（以论文与单点实验为主，无标杆产品） |

**结论：AgentUp 押注 L2 作为产品核心是正确的行业卡位**——L1 由各家运行时自行解决，L3 尚不成熟，L2 有成熟组件但无整合者。

---

## 二、核心范式：Agent 运行 Loop 深度剖析

### 2.1 规范循环（The Canonical Loop）

无论框架如何包装，业界公认的 Agent 运行环可压缩为 6 行伪代码（Braintrust 称之为 "the canonical agent architecture: a while loop with tools"）：

```
context = [system_prompt, user_input]
while True:
    response = llm(context)
    if response.is_final_answer: break        # 终止条件①：模型宣告完成
    for call in response.tool_calls:
        observation = execute(call)            # 环境反馈
        context.append(call, observation)
    if turns > max_turns: raise BudgetError   # 终止条件②：预算护栏
```

学术原型是 **ReAct**（Yao et al., 2022）：Reason（思考）→ Act（调用工具）→ Observation（观察结果）交替进行，将"推理轨迹"与"外部行动"耦合在同一上下文中。现代实现（Anthropic/OpenAI/LangChain）本质上都是 ReAct 的工程化，区别在于把"思考"内化进了模型的 function calling 协议。

Anthropic《Building Effective Agents》进一步区分了 **workflow（预定义代码路径编排 LLM）与 agent（LLM 自主决定过程与工具使用）**，并给出五种 workflow 积木：prompt chaining、routing、parallelization、orchestrator-workers、evaluator-optimizer。**选型纪律：先找最简单的可行方案，仅当可证明收益时才增加复杂度**；多数场景"优化单次 LLM 调用 + 检索 + 上下文示例"就够了。

### 2.2 主流实现对比

| 维度 | Anthropic（Claude Agent SDK / 裸 while+tools） | OpenAI Agents SDK | LangChain/LangGraph | 裸 while 循环 |
|------|------|------|------|------|
| 循环控制 | 开发者自持 while 循环，官方鼓励"直接用 API，少抽象" | SDK 提供 Runner 循环：LLM 输出 → 判定 final output / handoff / tool call 三分支 | 图结构（节点/边）显式建模循环与分支 | 全手动 |
| 终止判定 | 模型停止发 tool_use 即视为完成 | 输出被分类为 final output（可配 output_type 结构化校验） | 到达 END 节点 / 条件边 | 自定义 |
| 多 Agent | 子 agent 作为工具调用 | 内置 handoff（agent 间交接 + input_filter 过滤传递上下文） | 多节点图 | 自定义 |
| 护栏 | guardrails 需自建于并行分支（官方建议 guardrail 用独立 LLM 调用并行筛查） | 内置 input/output guardrails、工具审批流（approval interruption）、`pre_approval_tool_input_guardrails` | callbacks + 自定义 | 无 |
| 预算 | 自持 max steps / token 预算 | `max_turns`（默认限流，超限抛 `MaxTurnsExceeded`；`max_turns=None` 关闭） | recursion_limit | 自持 |
| 可观测 | hooks / telemetry 自建 | RunResult 保留完整事件流（可序列化恢复 RunState） | LangSmith trace 原生集成 | 全手动 |
| 上下文管理 | compaction（压缩）内置于 Claude Agent SDK | `nest_handoff_history`（beta）压缩嵌套交接历史 | 自定义 | 自持 |

**要点**：框架差异主要在"护栏、交接、恢复"的完备度上。OpenAI Agents SDK 是三者中"循环管理 + 预算 + 护栏"开箱最全的；Anthropic 路线强调透明与少抽象；LangGraph 适合需要显式状态机的复杂流程。

### 2.3 终止条件分类学

综合各实现，生产级 Agent 的终止条件应至少覆盖四类（缺任何一类都有事故记录）：

1. **目标达成终止**：模型产出 final output（无 tool call / 通过结构化输出校验）。风险：模型"过早宣布完成"（Anthropic 长时任务实验的头号失败模式）。
2. **预算终止**：max_turns、token 预算、墙钟超时、成本上限。OpenAI SDK 的 `max_turns` + `MaxTurnsExceeded` 是标准做法。
3. **护栏终止**：input/output guardrail 判定违规 → 中断并给出替代回复；高风险工具走人工审批（human-in-the-loop interruption）。
4. **环境终止**：外部信号强制收敛——如编码 Agent 以"测试通过"为终止判据（Anthropic 指出代码场景之所以成功，正因为"解可用自动化测试验证"）。

### 2.4 成本控制机制（Manus 实践为最系统公开材料）

Manus 团队（2025-07）将成本/性能控制总结为六条，值得逐条吸收：

| 机制 | 原理 | 量化收益/要点 |
|------|------|------|
| **KV-cache 命中率为生命线** | 相同前缀可复用 KV-cache，大幅降低 TTFT 与 prefill 成本 | Claude Sonnet 缓存命中输入 $0.30/MTok vs 未命中 $3/MTok（10×）。Manus 输入:输出 token 比约 100:1，prefill 主导成本 |
| **前缀稳定 + append-only** | 系统提示词放秒级时间戳会从该 token 起全量击穿缓存；序列化必须确定性（JSON key 顺序稳定） | 常见错误：动态时间戳、随机化前缀、改写历史 action/observation |
| **Mask, Don't Remove** | 工具集膨胀时不要动态增删工具定义（击穿缓存 + 历史引用失效导致幻觉/schema 违规），改用 logit 掩码 / response prefill 约束动作空间 | 三档约束：Auto（可不调工具）/ Required（必须调）/ Specified（限定子集）；工具命名加统一前缀（browser_*、shell_*）便于状态机分组 |
| **文件系统即上下文** | 上下文窗口再大也不够用且超长后性能劣化；把文件系统当作"无限量、持久、可操作"的外部记忆，压缩策略必须**可恢复**（留 URL/路径而非永久丢弃内容） | 任何不可逆压缩都有风险——无法预测哪条 observation 十步之后会关键 |
| **Recitation 操纵注意力** | 长任务（Manus 平均 ~50 次工具调用）会"lost-in-the-middle"；让 Agent 维护 todo.md 并逐步勾选，等于把全局目标复诵到上下文末端 | 用自然语言偏置注意力，零架构改动 |
| **保留错误（Keep the Wrong Stuff In）** | 抹掉失败轨迹 = 抹掉证据，模型无法更新信念；把错误动作与报错留在上下文里，模型会隐式降低重复该动作的先验 | Manus 认为 error recovery 是真 agentic 行为的最清晰标志，但学术界 benchmark 普遍缺测此项 |

补充两条 Anthropic 侧的成本纪律：**routing 分流**（简单/常见问题路由到小模型，难题路由到大模型）与 **evaluator-optimizer 仅在"评估标准明确且迭代可测"时使用**。

### 2.5 防死循环 / 防提前终止策略（Anthropic 长时任务 Harness）

Anthropic《Effective harnesses for long-running agents》针对"跨多个上下文窗口的长时任务"给出了目前最完整的失败模式清单与对策，对 AgentUp 评估"被管理对象"（各产品线 Agent）的运行质量同样适用：

| 失败模式 | Initializer Agent 对策（首个上下文窗口） | Coding Agent 对策（后续每个窗口） |
|---------|----------------------------------------|----------------------------------|
| 一次想做完全部（one-shotting），中途耗尽上下文留下半成品 | 生成 init.sh、claude-progress.txt、初始 git commit | 每次只做一个 feature（incremental progress） |
| 过早宣布项目完成 | 把需求展开为 200+ 条 feature list（JSON 格式，初始全标 failing） | 读 feature list，只允许翻转 `passes` 字段；强措辞禁止删改测试定义（JSON 比 Markdown 更难被模型乱改） |
| 环境留下 bug / 进度无记录 | 建 git 仓库 + 进度文件 | 会话开始先读进度文件与 git log；结束必须 git commit + 写进度摘要（git 同时充当回滚点） |
| 未端到端验证就标记完成 | 写 init.sh 保证能一键起环境 | 显式要求用浏览器自动化（Puppeteer MCP）"像真实用户一样"验证后再标 passing |

**通用防死循环清单**（可直接作为 AgentUp 对被管理 Agent 的验收检查项）：

1. 有 max_turns / token / 时间 / 成本至少一种硬预算；
2. 终止判据可程序化验证（测试、结构化输出校验），而非模型自述"我完成了"；
3. 工具调用幂等性 + poka-yoke 设计（Anthropic：绝对路径替代相对路径后错误率归零——"像对待 HCI 一样投资 ACI"）；
4. 重复动作检测（同一工具 + 近似参数连续 N 次 → 告警/中断）；
5. 长任务用"进度文件 + 任务清单复诵"防止目标漂移；
6. 失败轨迹保留而非静默重试，避免"温度魔法"掩盖系统性错误。

---

## 三、Harness 工程纪律的产品化

### 3.1 Harness 的组成

业界（awesome-harness-engineering 社区综述）将 Harness 拆为七个组件域：**循环控制、上下文工程、记忆、工具与权限、沙箱执行、可观测性、评估**。AgentUp 的四分区（Prompt/Knowledge/Tools/Routing）+ Release/Version 恰好是其中"配置与变更管理"切片的产品化。

### 3.2 四大支柱的产品化现状

| 支柱 | 行业做法 | 代表产品 | AgentUp 现状 |
|------|---------|---------|-------------|
| **版本控制** | 配置即资产：prompt/工具/路由全量不可变快照 + 语义化版本 + 一键回滚；环境（dev/staging/prod）与版本解耦 | Braintrust Deploy（prompt versioning + environment management）、LangSmith Prompt Hub、Humanloop、PromptLayer | ✅ 已实现（lib/versioning.ts SemVer + 不可变快照 + 回滚），且覆盖四分区全量，强于多数仅管 prompt 的同类 |
| **灰度发布** | 按流量比例 / 用户群 / 标签灰度新版本，在线指标对比后再全量；失败自动回滚 | LangSmith Deployments、Braintrust 环境路由、各云厂商 LLM Gateway 分流 | ❌ 未实现（MVP 明确排除），审批通过即全量 |
| **自动化评估** | 离线：golden dataset + experiments（每版本一次实验，钉住数据集版本，与 baseline 对比分数 delta）；在线：LLM-as-judge 对生产 trace 持续打分；发布门禁：回归指标不达标不放行 | Braintrust（eval-first，按 score 计费）、LangSmith（trace-first，转 regression test）、Langfuse（datasets + experiments）、DeepEval/RAGAS（评估框架） | ❌ 无 eval 框架、无 golden set、审批是"盲批" |
| **可观测性** | 全量 trace（含检索命中/得分、工具入参出参、token 成本、延迟）+ session 聚合 + 人工标注队列 + 负反馈自动入库 | LangSmith、Langfuse、Arize、OTel GenAI 语义规范 | ⚠️ 仅 dashboard 聚合统计；Feedback 靠手动粘贴会话 |

### 3.3 Golden Dataset 工程方法论（Langfuse 工程指南提炼）

这是"自动化评估"支柱中方法论最成熟、且与 AgentUp 工单复盘场景直接相关的部分：

1. **信任即价值**：golden = 有领域知识的人审过期望输出（或明确决定免参考答案、改用无参考检查）。未经人审的样本堆产出的分数没人会据此行动。
2. **一个数据集只回答一个问题**：按组件/行为拆分（端到端 / 检索 / 路由 / 摘要各一套），失败才能指向原因。
3. **规模匹配用途而非最大化**：探索单问题 ~10 条；CI 快门禁几十条；完整回归集 100～1000 条覆盖生产分布；护栏渗透测试集持续膨胀。
4. **覆盖失败模式而非 happy path**：凡引发过事故/工单的输入类别都必须有对应样本；"全是简单样本的数据集永远 95 分，什么都说明不了"。
5. **从生产 trace 生长**：负反馈 trace（点踩、人工纠正）在失败还"新鲜"时即入库；期望输出 = 模型实际输出经专家修正。
6. **维护纪律**：schema 校验（第一天就定，事后补是清理项目）、去重、条目版本化、append-mostly 保鲜——"一月的数据集描述一月的流量，七月用户问的已经是别的问题"。
7. **版本对比协议**：每个配置版本对**同一钉住版本的数据集**跑一次 experiment，读与指定 baseline 的分数 delta——这是"新版 prompt 是否感觉更好"变成"测量结论"的唯一途径。

### 3.4 评估平台路线对比（对 AgentUp 选型的启示）

| 平台 | 路线 | 计费锚点 | 强项 | 弱项 |
|------|------|---------|------|------|
| **LangSmith** | trace-first | 按 trace 量 | LangChain 原生、trace → regression test 工作流完整、在线评估器 | 与 LangChain 生态绑定较深 |
| **Braintrust** | eval-first | 按 score 量 | 实验/打分/数据集工作流最强，有 Deploy（prompt 版本 + 环境） | 不部署 agent 本体；生产工作流弱于 LangSmith |
| **Langfuse** | 开源可自托管 | 自托管免费 | trace/dataset/experiment 一体、适合专有云/数据不出域场景 | 托管能力与生态弱于前两者 |

**对 AgentUp 的启示**：专有云场景（数据不出域 + 被管理对象是多产品线的异构 Agent）决定了 AgentUp 不可能直接采购上述平台替代自身，但可以**吸收其数据模型**（trace → annotation → dataset item → experiment → baseline diff），并优先借鉴 Langfuse 的自托管思路。

---

## 四、分层改进模型：L1/L2/L3 的行业实现对比

### 4.1 L1 — 运行时交互环（分钟级）

**核心思想**：不改配置，只靠上下文内的反馈让本次任务自我修正。

| 技术 | 机制 | 关键结论 |
|------|------|---------|
| Reflexion（Shinn et al., 2023） | 任务失败 → 语言化自我反思 → 反思结论写入情景记忆 → 下次尝试携带 | "语言强化"：无需梯度即可跨尝试改进 |
| Manus 错误保留 | 失败 action + 报错留在上下文，隐式更新模型信念 | "抹掉失败 = 抹掉证据"；error recovery 应作为 Agent 能力的一等评测项 |
| Recitation（todo.md） | 目标复诵到上下文末端，对抗 lost-in-the-middle | 50 次工具调用的长任务里显著降低目标漂移 |
| Evaluator-optimizer（Anthropic） | 生成者 + 评估者双 LLM 循环迭代 | 仅当评估标准明确、且"人一说反馈模型就能改好"时才值得 |

**行业共识**：L1 改进的天花板由"反馈信号的质量"决定——编码 Agent 之所以是最成功的 Agent 品类，正因为测试结果是免费、客观、即时的 L1 反馈。**工单场景的等价物是"客户是否追问/转人工/关单"，AgentUp 的 Feedback 标签体系正是在补这个信号源。**

### 4.2 L2 — 产品配置改进环（小时～天级，AgentUp 主场）

**核心思想**：把 L1 暴露的失败，经人/机协作转化为配置变更（prompt/知识/工具/路由），经验证后发布。

行业最佳实践链路（LangSmith/Langfuse/Braintrust 综合）：

```
生产 trace + 用户负反馈
  → 标注队列（人审）→ 失败归因（error analysis，先于 eval 的纪律）
  → 分流修复动作：改 prompt / 补知识 / 修工具 / 调路由
  → 失败样本同时沉淀为 golden dataset item
  → 改后跑 experiment（钉住数据集版本，对比 baseline）
  → 发布门禁（修复 N 条 / 回归 0 条）→ 灰度 → 在线评估监控 → 全量或回滚
```

**自动化优化器正在进入此层**：

- **DSPy**：把 prompt 当"可编译参数"，用 metric 驱动自动搜索指令与 few-shot 组合；
- **GEPA**（Genetic-Pareto，DSPy 生态）：对执行 trace 做**自然语言反思**式变异，遗传-帕累托选择；官方对比称比 RL 方法少 ~35× rollout 达到更优——**这是"用 LLM 分析自己的失败轨迹来改自己的 prompt"的工业化雏形，与 AgentUp 设想的"LLM 根因分析 → 建议 targetPartition"方向完全一致**；
- **人机分工现状**：优化器产出候选变更，人审 + 审批门禁后才发布——与 AgentUp 的 Release 审批流天然兼容。

### 4.3 L3 — 跨 Agent 智能进化环（天～周级）

**核心思想**：跨 Agent、跨任务沉淀共性能力，反哺个体 Agent。

| 路径 | 代表工作 | 机制 | 成熟度 |
|------|---------|------|--------|
| 技能库沉淀 | Voyager（Minecraft 终身学习 Agent） | 成功的解法被编写为**可复用技能（代码/流程）**存入技能库，按相似度检索调用；能力随时间单调增长 | 学术验证充分，工程产品少见 |
| 知识蒸馏 | llm-wiki（Compile, don't retrieve） | 把原始语料/会话"编译"为带溯源的蒸馏知识网，运行时优先检索蒸馏态 | AgentUp 的 wiki vault（provenance/lifecycle/tier/confidence）即此路线 |
| 上下文/记忆进化 | 自进化 Agent 综述的 context-level evolution | 记忆库的增删改查策略本身被优化（什么值得记、何时遗忘、如何合并） | 论文为主 |
| 模型级进化 | self-play / RL on traces | 用 Agent 自身轨迹训练底座模型 | 对业务团队不可行（需训练资源），属于基模厂商的游戏 |
| 系统级进化 | 多 Agent 拓扑自动重组 | 自动增删子 Agent、调整协作结构 | 前沿探索 |

**行业判断**：L3 目前唯一有工程落地价值的是前两条——**技能库沉淀**与**知识蒸馏**，且都绕开了模型训练。AgentUp 为 L3 预留的三个扩展点（Feedback 聚合发现共性缺口、Version 跨 Agent 对比发现有效改进模式、wiki 跨 vault 复用通用概念页）恰好覆盖了这两条路径的数据前提，方向正确。

### 4.4 三层对比总表

| 维度 | L1 运行时 | L2 配置改进 | L3 跨 Agent 进化 |
|------|----------|------------|-----------------|
| 时间尺度 | 秒～分钟 | 小时～天 | 天～周 |
| 改进载体 | 上下文内反思/复诵 | prompt/知识/工具/路由配置 | 共享技能库 / 蒸馏知识网 / 共性洞察 |
| 触发信号 | 环境报错、测试失败、自我评估 | 用户负反馈、失败 trace、评测回归 | 跨 Agent 的共性失败模式聚合 |
| 人的角色 | 基本退出环路 | 归因确认 + 审批发布 | 审阅蒸馏产物、裁定共性结论 |
| 验证方式 | 本次任务是否成功 | golden set 回归 + 灰度在线指标 | 被反哺 Agent 的 L2 指标改善 |
| 行业成熟度 | 高 | 中（组件全、闭环缺） | 低（知识蒸馏/技能库可行，其余偏学术） |

---

## 五、案例对比与差距分析

### 5.1 行业标杆能力矩阵

| 能力 | LangSmith | Braintrust | Langfuse | Manus | Cursor | **AgentUp** |
|------|-----------|-----------|----------|-------|--------|------------|
| Trace 追踪（含检索轨迹/工具出入参） | ★★★★★ | ★★★★ | ★★★★ | ★★（内部有，不对外产品化） | ★★ | ★（仅手工粘贴会话） |
| 根因归因辅助 | ★★★（标注+过滤工具） | ★★★ | ★★★ | ★★ | ★ | ★（有 tag 骨架，无诊断引擎） |
| 评测集自动构建（trace→dataset） | ★★★★★（一键 + 批量 + SDK） | ★★★★ | ★★★★★（含负反馈定时扫描范式） | — | — | ★☆（Feedback 可录，但无自动沉淀） |
| 离线回归评测/experiments | ★★★★★ | ★★★★★ | ★★★★ | —（自述靠人工 "StochasticGraduateDescent"） | — | ☆ |
| 在线评估（生产打分） | ★★★★ | ★★★★ | ★★★ | — | — | ☆ |
| 配置版本控制 | ★★★（Prompt Hub） | ★★★★（Deploy） | ★★★ | — | ★★★（rules 文件） | ★★★★★（四分区全量快照+SemVer+回滚） |
| 灰度发布 | ★★★ | ★★★ | — | — | — | ☆ |
| 审批/发布门禁 | ★★ | ★★★ | ★★ | — | — | ★★★★（审批流完整，缺指标门禁） |
| 多 Agent/多团队管理 | ★★ | ★★ | ★★★ | — | — | ★★★★（产品组隔离+三角色） |
| 知识蒸馏引擎 | — | — | — | ★★（文件系统记忆） | ★★★（rules/memories 机制，开发者驱动） | ★（wiki 模型完备，引擎未实现） |

**读法**：LangSmith/Braintrust/Langfuse 赢在"证据链 + 评测"，AgentUp 赢在"变更治理（版本/审批/回滚/多租户）"。两类能力目前是割裂的——这正是整合机会。

### 5.2 行业共同短板（AgentUp 的差异化空间）

1. **Trace 追踪：检索轨迹普遍薄弱**。平台级 trace 对"工具调用"记录完善，但对 RAG 场景"语料里有没有 → 检索到没有 → 得分多少"这条链路，即使 LangSmith/Langfuse 也依赖接入方自行埋点。**工单复盘的核心问题"为什么没支持到"恰好落在这条链路上**。
2. **根因归因：没有产品把它做成一等公民**。所有平台的归因都停留在"人工打标签 + 过滤聚合"，把"语料缺失 / 检索未命中 / 语料过期 / 技能失败 / 能力边界"这类**决定修复动作的归因分类学**做成自动引擎（LLM + 检索回放）的产品为零。GEPA 证明了"LLM 反思执行轨迹"可行，但它是改 prompt 的优化器，不是归因诊断器。
3. **评测集自动构建：有"手动沉淀工具"，无"制度"**。trace→dataset 的操作各平台都有，但"每张失败工单自动变成一条 eval case、归因标签直接映射期望输出"的自动化流水线没有现成产品。Manus 更是公开承认其改进靠人肉"随机毕业生下降"（SGD 自嘲），说明一线团队同样缺此制度。
4. **闭环验证：发布前回放是空白**。"拿失败工单重放新版本，验证这次改动是否修复了它、是否改坏了别的"——各平台的 experiments 能做版本对比，但没有一家把它嵌进**审批流**作为门禁。AgentUp 已有的 Release 审批恰好是挂载点。
5. **错误恢复能力被系统性低估**（Manus 明确指出）：公开 benchmark 专注理想条件下的任务成功率，error recovery 几乎不被测量——AgentUp 未来做"被管理 Agent 的验收评估"时，这应成为差异化指标。

### 5.3 对照 AgentUp 现状的差距总结（更新 2026-07-31 结论）

| # | 差距 | 2026-07-31 状态 | 2026-08-26 更新 |
|---|------|----------------|----------------|
| 1 | Trace 证据链 | Feedback 仅手工粘贴 | 未变；本报告给出结构化字段建议（见 §6.3） |
| 2 | 失败归因引擎 | tag 骨架有，归因靠拍脑袋 | GEPA/Reflexion 证明"LLM 反思轨迹"技术路线成立，可直接立项 |
| 3 | Golden set + 回归门禁 | 无 | Langfuse 方法论已可直接移植（规模/来源/schema/保鲜/对比协议五要素） |
| 4 | 蒸馏引擎 | wiki 模型完备、引擎缺 | 行业确认此为 L3 唯一可落地的工程路径，优先级应维持 |
| 5 | 灰度发布 | 明确不做 | 行业确认其为"配置改进环"标配；建议至少做"版本 A/B 对比实验"过渡 |
| 6 | 工程基线（auth/DB/CI） | 单文件 JSON、stub 登录 | 维持"按规模触发"判断，见 §6.1 |

---

## 六、落地路径：从 MVP 到规模化

### 6.1 关键技术债清单与触发条件

业界共识是"技术债按使用规模触发偿还"，不预支：

| 技术债 | 当前可容忍条件 | 必须偿还的触发点 | 建议方案 |
|--------|--------------|----------------|---------|
| 真实鉴权与 RBAC | 单人/小团队内部使用 | 第二个产品组真实入驻、或对接真实工单系统 | NextAuth/JWT 接入既有 getActor() 上下文；角色沿用三角色模型 |
| JSON 文件存储 → 数据库 | 数据量小、单实例 | 评测集/trace 入库（预计最先撑爆）、并发写入冲突 | Prisma schema 已就绪（30 模型），切 Postgres 是既定路线 |
| 沙箱执行 | 平台本身不执行被管理 Agent | 一旦平台提供"试跑/回放评测"就必须有 | 回放评测初期只需"重放 LLM 调用 + mock 工具返回"，无需真沙箱；真沙箱（执行工具/MCP）留到 skill 可执行化阶段 |
| CI/CD + 备份 | 个人维护 | 多人协作 | 测试基线已好（232 测试 / 高覆盖率），加 pipeline 即可 |
| 审计日志入库 | 单文件可查 | 审批行为需合规追溯 | 随数据库切换一并迁移 |

### 6.2 功能优先级（融合本轮行业调研的修订版）

| 优先级 | 主题 | 内容 | 行业依据 |
|--------|------|------|---------|
| **P0** | 证据链 | Feedback 结构化工单上下文（工单号/产品线/实际回答/检索命中列表/工具调用记录）+ 批量导入；外部语料库（工单 ack 库 / AI Stack 库）检索探针 | §5.2-1：复盘的第一个问题是"语料里到底有没有" |
| **P1** | 归因引擎 | LLM 根因分析：工单上下文 + 回放检索结果 → 五类归因（语料缺失/检索未命中/语料过期/技能失败/能力边界）+ 证据 + 建议 targetPartition，人审确认写回 | §4.2 GEPA / §5.2-2 |
| **P2** | 评测闭环 | 失败工单自动沉淀 golden dataset item（schema 校验 + 期望输出人审）；Release 审批前自动回放：给审批人看"修复 N 张 / 回归 0 张"；版本实验对比协议（钉住数据集版本 + baseline diff） | §3.3 七条方法论 / §5.2-3,4 |
| **P3** | 蒸馏引擎 | wiki-ingest/update/lint 实现；confidence 计算；Feedback→wiki 页一键蒸馏走 Release 审批 | §4.3：L3 唯一可落地路径 |
| **P4** | 工程债 | auth/Prisma/CI/审计，按 §6.1 触发条件滚动偿还 | 业界"匹配阶段"纪律 |
| **远期** | L3 洞察 | 跨 Agent Feedback 聚合看板（共性知识缺口）、Version 跨 Agent 对比（有效改进模式挖掘）、跨 vault 通用概念页 | §4.3 / §5.2-5 |

### 6.3 针对 AgentUp 的具体建议

**架构判断（保持不变）**：
- 押注 L2、四分区、Release→Version、三角色——本轮调研全部支持这些原始决策；AgentUp 的变更治理能力（★4-5）相对评估观测平台（★0-1）的倒挂，正是差异化整合点。

**短期（P0-P1，1-3 周量级）**：
1. Feedback 数据模型扩展按"一条 trace 的最小投影"设计：`query / retrieved_items[{source, score}] / tool_calls[{name, input_digest, ok}] / final_answer / user_signal`——与 Langfuse observation 模型对齐，未来可平滑升级为完整 trace store；
2. 归因引擎复用已接入的 MiMo LLM 网关，提示词采用"先复述证据 → 再给归因 → 最后给 targetPartition 建议"的三段式（对应 Anthropic 透明性原则）；归因结论必须可被人一票否决；
3. 把"检索探针"做成 MCP 工具注册进现有 tools 分区模型——平台自用的工具与被管理 Agent 的工具共用一套元数据，未来可复用。

**中期（P2，3-6 周量级）**：
4. Golden dataset 从第一天就定 JSON Schema（input/expected_output/metadata：来源工单号、归因标签、入库日期）；
5. 回放评测先做"纯 LLM 重放"（新版本 prompt + 原 query，judge 对比），工具层用 trace 中记录的返回值 mock——避开真沙箱依赖；
6. Release 详情页增加"评测证据"区块，审批人看到的从 changeNote+diff 升级为 changeNote+diff+修复/回归数——这是把平台从"记录改进"升级为"验证改进"的关键一步。

**长期（P3+ 与 L3）**：
7. 蒸馏引擎落地顺序：wiki-ingest（Feedback→draft 页）→ lifecycle 审阅流 → confidence/lint；
8. 灰度缺位的过渡方案：同一 Agent 允许"候选版本 + 现行版本"并存，用评测集做离线 A/B，等价于穷人版灰度；
9. L3 先做"聚合看板"（只读洞察，不改数据），验证跨 Agent 共性结论的价值后再投入自动化；
10. 验收被管理 Agent 时引入 error recovery 指标（行业空白点，AgentUp 作为平台方有定义权）。

---

## 七、结论

1. 行业的**运行环已经收敛**（while+tools），竞争焦点转移到终止判定、预算护栏与上下文/成本工程；Manus 六条上下文纪律与 Anthropic 长时 harness 失败模式表是当前最可操作的公开知识。
2. **Harness 工程正在产品化**，但市售平台只覆盖了"评估观测"或"配置治理"的一半；完整闭环（证据 → 归因 → 修改 → 验证 → 审批 → 回滚）没有标杆产品。
3. AgentUp 的三层 Loop 与学术 taxonomy 同构，**L2 卡位正确**；核心差距仍是 2026-07-31 报告指出的三件事（trace、归因、回归验证），本轮调研为其补齐了方法论细节（golden dataset 七要素、回放评测的穷人实现、GEPA 式反思归因的技术可行性证据）。
4. 下一步主线不变：**复盘有据 → 归因有理 → 加强有验**；工程债按规模触发，L3 以蒸馏与聚合洞察为可落地起点，模型级自进化不在业务团队射程内，不必投入。

---

## 附录：参考资料

**官方工程博客**
- Anthropic — Building Effective Agents: https://www.anthropic.com/engineering/building-effective-agents
- Anthropic — Effective harnesses for long-running agents: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Anthropic — Writing effective tools for AI agents: https://www.anthropic.com/engineering/writing-tools-for-agents
- Manus — Context Engineering for AI Agents: Lessons from Building Manus: https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus
- Cursor — Best practices for coding with agents: https://cursor.com/blog/agent-best-practices
- OpenAI Agents SDK — Running agents（Runner 循环 / max_turns / guardrails）: https://openai.github.io/openai-agents-python/running_agents/

**平台与方法论**
- Braintrust — The canonical agent architecture: a while loop with tools: https://www.braintrust.dev/blog/agent-while-loop
- Langfuse — Golden dataset evaluation: build and maintain LLM test sets: https://langfuse.com/resources/engineering/golden-dataset-evaluation
- LangChain — LLM Evals: The Feedback Loop Behind Reliable AI Agents: https://www.langchain.com/resources/llm-evals
- LangChain — LangSmith vs Braintrust: https://www.langchain.com/resources/langsmith-vs-braintrust
- DeepEval — LLM-as-a-Judge techniques: https://deepeval.com/blog/llm-as-a-judge

**学术与优化器**
- Yao et al., ReAct: Synergizing Reasoning and Acting in Language Models: https://arxiv.org/abs/2210.03629
- Shinn et al., Reflexion: Language Agents with Verbal Reinforcement Learning: https://arxiv.org/abs/2303.11366
- A Survey of Self-Evolving Agents: On Path to Artificial Super Intelligence: https://arxiv.org/abs/2507.21046
- GEPA: Reflective Prompt Evolution (DSPy): https://dspy.ai/tutorials/gepa_ai_program/ ; https://github.com/gepa-ai/gepa
- Wang et al., Voyager: An Open-Ended Embodied Agent with Large Language Models: https://arxiv.org/abs/2305.16291
- A Survey on Agent System and Harness Design: https://arxiv.org/html/2606.20683v1
- awesome-harness-engineering: https://github.com/ai-boost/awesome-harness-engineering
- Awesome-Self-Evolving-Agents: https://github.com/XMUDeepLIT/Awesome-Self-Evolving-Agents
