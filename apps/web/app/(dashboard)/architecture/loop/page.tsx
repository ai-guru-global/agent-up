/*
 * 本页大量把 JSX 写在 <Table rows={[...]}> 的静态数据数组里；
 * Table 内部 map 渲染时已统一赋 key（见 _components/ui.tsx），
 * react/jsx-key 无法跨函数边界追踪，属于误报，故在本页豁免。
 */
/* eslint-disable react/jsx-key */
import { Mermaid } from "../../../components/mermaid";
import { Insight, PageHeader, Pill, References, Section, Table } from "../_components/ui";

const reactLoop = `
flowchart TD
  U["用户输入 / 工单"] --> TH["Thought · 推理当前状态"]
  TH --> AC["Action · 选择工具 + 参数"]
  AC --> ENV["环境执行工具<br/>（API / 文件 / Shell / 检索）"]
  ENV --> OB["Observation · 结果回写上下文"]
  OB --> DEC{"目标达成?"}
  DEC -- 否 --> TH
  DEC -- 是 --> ANS["Finish · 最终回答"]
  OB -. "异常作为 observation 直送模型" .-> TH

  style TH fill:#dbeafe,stroke:#2563eb
  style ANS fill:#dbeafe,stroke:#2563eb
`;

const anthropicMinimal = `
flowchart TD
  SP["system_prompt<br/>+ tool_descriptions"] -.-> CTX
  H["history<br/>（append-only）"] -.-> CTX["组装 context"]
  CTX --> M["model.invoke"]
  M --> D{"输出含 tool_calls?"}
  D -- 是 --> EX["并行执行工具"]
  EX --> RES["tool_results"]
  RES --> H
  D -- 否 --> OUT["返回最终回答<br/>（loop 终止）"]
  D -. "max_turns / 预算 / 超时<br/>循环检测 / 上下文压缩" .-> OUT
`;

const manusLoop = `
flowchart TD
  U["用户任务"] --> CTX["Context<br/>稳定前缀 + append-only history"]
  CTX --> MASK["Logit Masking<br/>状态机按上下文<br/>放行 / 屏蔽工具组"]
  MASK --> M["模型决策下一步动作"]
  M --> VM["VM 执行<br/>shell / browser / file"]
  VM --> OBS["observation"]
  OBS --> APP["append 到 history<br/>（永不编辑历史）"]
  APP --> ERR{"出错?"}
  ERR -- 是 --> KEEP["保留失败 + 错误栈<br/>模型隐式更新先验"]
  KEEP --> CTX
  ERR -- 否 --> TODO["重写 todo.md<br/>追加到 context 末尾<br/>把全局计划压入近因注意"]
  TODO --> DONE{"todo 完成?"}
  DONE -- 否 --> CTX
  DONE -- 是 --> FINISH["任务结束"]

  style MASK fill:#dbeafe,stroke:#2563eb
  style KEEP fill:#dbeafe,stroke:#2563eb
  style TODO fill:#dbeafe,stroke:#2563eb
`;

const agentsSdkRunner = `
flowchart TD
  S["Runner.run(agent, input)"] --> L["用 agent.instructions<br/>+ tools + history 调 LLM"]
  L --> P{"输出类型"}
  P -- "tool_call" --> EX["执行工具"] --> L
  P -- "handoff" --> SW["切换 current_agent = target<br/>刷新指令集 + 工具集"] --> L
  P -- "final_output" --> END["终止"]
  P -- "max_turns 超限" --> END
  GI["input guardrail"] -.-> S
  GO["output guardrail"] -.-> END
`;

const agentupL1L2L3 = `
flowchart LR
  subgraph RT["L1 · 运行时环（Agent 侧，分钟级）"]
    direction TB
    A1["工单进入"] --> A2["Agent: 推理→工具→观察"] --> A3["回答 / 转人工"] --> A4["会话 + 评分"]
  end

  subgraph DEV["L2 · 产品改进环（本平台核心，小时~天）"]
    direction TB
    B1["反馈（手填 → 规划: 自动采集）"] --> B2["根因分析"] --> B3{"改哪个分区?"}
    B3 -->|Prompt| B4a["编辑 system_prompt"]
    B3 -->|知识| B4b["wiki 页 / 蒸馏"]
    B3 -->|工具| B4c["Skill 绑定 / MCP"]
    B3 -->|路由| B4d["分类 / 转人工阈值"]
    B4a --> B5["提交 Release"]
    B4b --> B5
    B4c --> B5
    B4d --> B5
    B5 --> B6["工单团队审批<br/>diff + evidence"] --> B7["通过 → Version 快照"] --> B8["一键回滚"]
  end

  subgraph EVO["L3 · 智能进化环（规划中，周~月）"]
    direction TB
    C1["跨 Agent 洞察"] --> C2["通用知识缺口发现"] --> C3["自动蒸馏"] --> C4["共享概念池"]
  end

  A4 -- "反馈/评分" --> B1
  B7 -- "新版本上线" --> A1
  B7 -- "蒸馏原料" --> C1
  C4 -- "反哺知识" --> B4b
  C1 -- "通用改进建议" --> B4a

  style DEV fill:#dbeafe,stroke:#2563eb,stroke-width:2px
`;

const manusFivePractices = `
flowchart LR
  P1["① KV-cache 命中率<br/>稳定前缀 + append-only<br/>≈10x 成本差"]
  P2["② Mask 工具而非增删<br/>避免缓存失效 + 历史失配"]
  P3["③ 文件系统即上下文<br/>无界持久可恢复"]
  P4["④ todo.md 复述<br/>追加到 context 末尾<br/>操纵近因注意"]
  P5["⑤ 保留失败<br/>不静默重试<br/>模型隐式纠偏"]
  P1 -.-> CORE["单 loop 健壮性"]
  P2 -.-> CORE
  P3 -.-> CORE
  P4 -.-> CORE
  P5 -.-> CORE
  style CORE fill:#dbeafe,stroke:#2563eb
`;

const loopOverview = `
flowchart TD
  subgraph FAM["「Loop 这个产品」的全家福"]
    direction TB
    SKELETON["通用骨架<br/>while 未完成: 推理→行动→观察"]
  end
  subgraph AXES["三条改进轴（差异化所在）"]
    direction LR
    A1["轴 1 · 单 loop 健壮性<br/>KV-cache / 循环检测 /<br/>压缩 / logit mask"]
    A2["轴 2 · 多 Agent 扩展<br/>handoff / 并行 worktree /<br/>orchestrator-worker"]
    A3["轴 3 · 持久化与可恢复<br/>checkpoint / resume /<br/>彩虹发布"]
  end
  SKELETON --> AXES
  style SKELETON fill:#dbeafe,stroke:#2563eb,stroke-width:2px
`;

const threeAxes = `
flowchart LR
  subgraph A1["轴 1 · 单 loop 健壮性<br/>Manus 是标杆"]
    A1a["KV-cache 命中率<br/>稳定前缀 + append-only"]
    A1b["循环检测<br/>同 tool+args 重复 N 次"]
    A1c["上下文压缩<br/>compaction / reset"]
    A1d["logit masking<br/>动态收窄工具空间"]
  end
  subgraph A2["轴 2 · 多 Agent 扩展"]
    A2a["OpenAI handoff<br/>A 让位给 B，刷新指令+工具"]
    A2b["Cursor 并行 worktree<br/>8-10 个 agent 隔离"]
    A2c["Claude Research<br/>orchestrator fan-out 3-5+"]
  end
  subgraph A3["轴 3 · 持久化 / 可恢复"]
    A3a["LangGraph checkpoint<br/>每 superstep 持久化"]
    A3b["resume-from-state<br/>断点续跑"]
    A3c["彩虹发布<br/>灰度 + 回滚"]
  end
  style A1 fill:#dbeafe,stroke:#2563eb
`;

export default function LoopEngineeringPage() {
  return (
    <div>
      <PageHeader
        title="Loop 工程"
        badge="设计核心"
        subtitle="「Loop」在 AI Agent 语境下指 Agent 的推理-行动-观察循环。每一个严肃的 Agent 都收敛到同一个骨架：while 未完成 → 推理 → 行动 → 观察。差异集中在上下文工程、工具设计、终止条件、多 Agent 扩展。本页把业界 Loop 设计核心展示清楚，并与 AgentUp 自身的三层 Loop 对齐。"
      />

      <Section
        title="0 · Loop 工程全景"
        description="每一个严肃的 Agent 都收敛到同一个骨架（左）。差异化全在三条改进轴上（右）：单 loop 健壮性、多 Agent 扩展、持久化与可恢复。本页后续按这条线索展开。"
      >
        <Mermaid chart={loopOverview} />
        <Insight label="一句话定位">
          <strong>Loop 是产品</strong>。骨架（while + 推理-行动-观察）各家一致；真正决定质量的是三条轴上的工程投入。AgentUp 作为 L2/L3 的改进平台，本质是在「Agent 配置的迭代」这条新 loop 上复用这些工程纪律。
        </Insight>
      </Section>

      <Section
        title="① ReAct · 一切的源头（Yao et al. 2022）"
        source="arXiv:2210.03629"
        description="现代 Agent loop 的奠基范式。Thought → Action → Observation 三段循环，把「推理」与「行动」交织在一起，让模型既能解释自己，又能调用工具。所有后来的 loop 都是它的变体。"
      >
        <Mermaid chart={reactLoop} />
        <Table
          head={["阶段", "职责", "关键设计"]}
          rows={[
            ["Thought（推理）", "产出对当前状态的推理轨迹", "必须显式化 —— 是可解释性的来源，也是后续 self-reflection 的基础"],
            ["Action（行动）", "从动作空间选一个工具 + 参数，结构化输出", "动作空间需可枚举；Manus 进一步用 logit masking 动态收窄"],
            ["Observation（观察）", "环境返回工具结果，回写到上下文", "失败也作为 observation 直送模型，不要包装重试"],
            ["Finish / 终止", "判定目标达成并产出最终回答", "ReAct 用显式 Finish[]；后续工作加上了 max-iter / 预算 / 超时"],
          ]}
        />
      </Section>

      <Section
        title="② Anthropic · 最小生产范式（while + tools）"
        source="Building Effective Agents, 2024"
        description="Anthropic 的核心论点：Agent = 「LLM 在一个 while 循环里，加上工具」。反对过度工程化 —— 多数生产场景应该是「增强 LLM + 检索 + 工具」，而不是全自动 Agent。"
      >
        <Mermaid chart={anthropicMinimal} />
        <Table
          head={["终止条件", "说明", "为何重要"]}
          rows={[
            ["模型自然停", "不再发出 tool_call", "最常见，但不可靠 —— 模型可能提前收尾"],
            ["max_turns", "硬性迭代上限", "防止 runaway 的第一道闸"],
            [<span><strong>预算 / token</strong></span>, "累计花费或 token 上限", "成本可控；Manus 指出 agent 的 input:output ≈ 100:1"],
            ["时间预算", "wall-clock 超时", "面向用户场景必备"],
            [<span><strong>循环检测</strong></span>, "同 tool+args 连续重复 N 次", "Manus / Anthropic 都强调；防止「Ralph Wiggum loop」"],
            [<span><strong>上下文窗口触顶</strong></span>, "触发 compaction（就地摘要）或交接给新 subagent", "长任务的核心瓶颈"],
            ["人工中断 / 审批门", "HITL 在关键节点介入", "AgentUp 的 Release 审批正是这一类"],
          ]}
        />
        <Insight label="为什么这页对 AgentUp 重要">
          AgentUp 的 L2「提交 → 审批 → 上线」本质上就是 Agent 改进 loop 里的{" "}
          <strong>人工中断门</strong>。Anthropic 的 7 种终止条件，可以反过来用于设计「AgentUp 该在哪些环节加门」：例如 Wiki 蒸馏 Job 的 max_turns、预算上限、循环检测。
        </Insight>
      </Section>

      <Section
        title="③ Manus · 上下文工程的五个反直觉决策"
        source="Context Engineering for AI Agents, 2025"
        description="Manus 是目前公开资料里对「单 loop 健壮性」最深入的工程实践。平均一个任务 ≈50 次工具调用，input:output ≈ 100:1，所以上下文工程 = 成本工程 = 质量工程。"
      >
        <Mermaid chart={manusLoop} />
        <Mermaid chart={manusFivePractices} className="mt-4" />
        <Table
          head={["决策", "反直觉之处", "对 AgentUp 的启发"]}
          rows={[
            [
              "KV-cache 命中率是 #1 生产指标",
              "缓存 token $0.30/MTok vs 未缓存 $3.00 —— 10x 差距",
              "L1 Agent 的 system_prompt 应固定前缀；wiki 检索结果追加在末尾，不要插在中间",
            ],
            [
              "Mask 工具，而非增删",
              "动态加减工具会让 cache 失效，且历史里出现「不存在的工具」会误导模型",
              "AgentUp 的「工具」分区若要按工单类型动态收窄，应走 logit mask，而非改 prompt",
            ],
            [
              "文件系统即上下文",
              "128K 上下文远远不够；把可恢复的内容落到文件，只留引用",
              "Wiki vault 正是这一思路的体现 —— 蒸馏页 + provenance，Agent 只拿摘要 + 链接",
            ],
            [
              "todo.md 复述",
              "把全局计划重写后追加到 context 末尾，借模型的近因偏置维持任务聚焦",
              "长工单场景下，AgentUp 的路由分区可以输出结构化「任务清单」喂给 L1 Agent",
            ],
            [
              "保留失败",
              "失败动作 + 错误栈留在上下文，模型隐式降低该动作的先验",
              "L2 反馈闭环里，CRE 的「失败案例」本身就是高价值训练信号 —— 别只存成功路径",
            ],
          ]}
        />
      </Section>

      <Section
        title="③ bis · Loop 的三条改进轴"
        description="把上面所有系统的差异化，归纳成三条独立的改进轴。每条轴都可以单独投入，互不阻塞。这是「loop 这个产品」差异化所在的全貌。"
      >
        <Mermaid chart={threeAxes} />
        <Table
          head={["轴", "解决什么", "标杆实现", "对 AgentUp 的启发"]}
          rows={[
            [
              <span><strong>轴 1 · 单 loop 健壮性</strong></span>,
              "让单个 Agent 在长任务里不崩：成本可控、不跑飞、不重复、上下文不膨胀",
              <Pill tone="good">Manus（最深）</Pill>,
              "L1 Agent 的 Prompt 固定前缀；wiki 检索结果追加在末尾；失败案例不擦除",
            ],
            [
              <span><strong>轴 2 · 多 Agent 扩展</strong></span>,
              "把单个 loop 扩展成多个协作 loop：专业化、并行、控制转移",
              "OpenAI handoff / Cursor 并行 worktree / Claude Research fan-out",
              <span>L2 的「Release 审批」可演进为「agent 自审 + agent 互审」（Anthropic Generator/Evaluator）</span>,
            ],
            [
              <span><strong>轴 3 · 持久化 / 可恢复</strong></span>,
              "loop 跑到一半崩了能续；代码更新不破坏在跑的 agent",
              <Pill tone="good">LangGraph checkpoint</Pill>,
              "AgentVersion 快照 = 配置级 checkpoint；灰度发布 = 彩虹发布的配置版",
            ],
          ]}
        />
        <Insight label="三条轴的关系">
          轴 1 是地基（单 loop 不稳，多 Agent 只会更乱）；轴 2 是杠杆（Claude Research 数据：多 Agent 比单 Agent +90.2%）；轴 3 是工程化（从 demo 走向生产）。AgentUp 当前主要在轴 2/3 的「配置层」做文章。
        </Insight>
      </Section>

      <Section
        title="④ OpenAI Swarm → Agents SDK · 把 loop 做成 Runner"
        source="openai/swarm · Agents SDK docs"
        description="Swarm 在自己 README 里被描述为「一个简单的 Python loop」。Agents SDK 把它演进成 Runner 循环 + 四原语（Agent / Tool / Handoff / Guardrail）+ Tracing。关键创新是「Handoff 作为一等公民」—— 同一个 loop 既驱动单 Agent，也驱动多 Agent。"
      >
        <Mermaid chart={agentsSdkRunner} />
        <Table
          head={["原语", "在 loop 中的角色"]}
          rows={[
            ["Agent", "一个 instructions + tools 的集合，是 loop 的「当前态」"],
            ["Tool", "模型发出意图 → harness 执行 → 结果回灌"],
            [
              <span><strong>Handoff</strong></span>,
              "一等公民控制转移：A 让位给 B，B 拿到新指令集 + 工具集。多 Agent 不需要额外 orchestrator 抽象",
            ],
            ["Guardrail", "loop 开始前（输入校验）与结束后（输出校验），独立于 turn loop"],
            [<span><strong>max_turns</strong></span>, "主要防 runaway 机制；超限是 first-class 终止态"],
            ["Tracing", "记录每次模型调用 / 工具 / handoff —— 可观测性的基础"],
          ]}
        />
      </Section>

      <Section
        title="⑤ AgentUp 三层 Loop · 与业界对齐"
        description="AgentUp 的「三层 Loop」是产品层抽象 —— 用时间尺度区分三种 loop，而非技术实现差异。把上面四种业界 loop 对号入座。"
      >
        <Mermaid chart={agentupL1L2L3} />
        <Table
          head={["层", "时间尺度", "对应的业界 loop", "本平台做什么"]}
          rows={[
            [
              <span><strong>L1 · 运行时环</strong></span>,
              "分钟级",
              <span>ReAct / Anthropic while+tools / Manus / Swarm Runner<br /><span className="text-xs text-zinc-400">（Agent 自己的推理-行动-观察循环）</span></span>,
              <span><strong>不在此平台构建</strong>。AgentUp 只消费它的产物：会话 + 评分 + 反馈</span>,
            ],
            [
              <span><strong>L2 · 产品改进环</strong></span>,
              "小时 ~ 天",
              <span>Anthropic 的「人工中断门」+ OpenAI 的「Repo 即真相源 + 机械约束」<br /><span className="text-xs text-zinc-400">（受控迭代 loop）</span></span>,
              <span><strong>本平台核心</strong>。四分区编辑 → Release → 审批 → Version 快照 → 回滚</span>,
            ],
            [
              <span><strong>L3 · 智能进化环</strong></span>,
              "周 ~ 月",
              <span>Anthropic Generator/Evaluator 的「外部怀疑式评估」+ Manus「文件系统即上下文」的蒸馏<br /><span className="text-xs text-zinc-400">（跨实例学习 loop）</span></span>,
              <span><strong>规划中</strong>。跨 Agent 洞察 + 自动蒸馏 + 共享概念池</span>,
            ],
          ]}
        />
        <Insight label="最关键的对齐判断">
          业界 Loop 工程的几乎所有经验都属于 <strong>L1</strong>（运行时），而 AgentUp 平台本身是{" "}
          <strong>L2/L3</strong> 的「改进 harness」。所以 AgentUp 能借鉴的不是「怎么把 Agent loop 写好」，
          而是<strong>怎么把业界 harness 的工程纪律（机械约束、外部评估、可观测、版本化）应用到「Agent 配置的迭代」上</strong> —— 这正是下一页 Harness 工程要展开的。
        </Insight>
      </Section>

      <Section
        title="⑤ bis · Loop 失败模式 · 诊断与修复"
        description="loop 在生产中最常见的四种崩法。每种都对应一个具体的工程修复——这张表可作为「症状 → 修复」的速查。"
      >
        <Table
          head={["失败模式", "症状", "根因", "修复（对应实现）"]}
          rows={[
            [
              <span><strong>过早终止</strong></span>,
              "模型说「完成了」但目标没达成",
              "只检查「模型停没停」而非「目标达没达」（Oracle L3 缺位）",
              "目标完成校验（Oracle L3）；Anthropic sprint contract 的可测行为",
            ],
            [
              <span><strong>跑飞 / runaway</strong></span>,
              "同一工具反复调用、永不收敛",
              "无循环检测、无 max_turns、无预算上限",
              "max_turns + 预算 + 循环检测（同 tool+args 重复 N 次即断）",
            ],
            [
              <span><strong>上下文膨胀</strong></span>,
              "跑到一半模型开始「忘记」早期指令、质量骤降",
              "context window 填满；无压缩、无外置记忆",
              "compaction（就地摘要）/ context reset（清空+交接）/ 文件系统即上下文（Manus）",
            ],
            [
              <span><strong>重复 rut</strong></span>,
              "批量任务里模型陷入相同输出模式",
              "few-shot 过强；序列化模板单一",
              "引入结构化变异（不同序列化模板、措辞、顺序噪声）—— Manus",
            ],
          ]}
        />
        <Insight label="AgentUp 对应的诊断">
          AgentUp 的 L2 loop 也有对应症状：①「Release 通过了但效果没改善」= 过早终止（缺发布后效果报告）；②「同一类反馈反复提交」= 跑飞（缺熵清理）；③「配置越改越乱」= 上下文膨胀（缺 diff 查看器/回滚）。每条都在改进路线图里有对应的修复项。
        </Insight>
      </Section>

      <Section
        title="⑤ ter · AgentUp 该在哪些环节加门"
        description="把 Anthropic 的 7 种终止条件，反过来用于设计 AgentUp 的改进 loop 该在哪些环节设置中断门。这是「Loop 工程纪律 → AgentUp 落点」的直接映射。"
      >
        <Table
          head={["门类型", "业界来源", "AgentUp 落点", "状态"]}
          rows={[
            ["人工中断 / 审批门", "Anthropic HITL", "Release 审批（人工 approve/reject）", <Pill tone="good">已实现</Pill>],
            ["max_turns / 预算", "通用防 runaway", "Wiki 蒸馏 Job 的迭代上限 + token 预算", <Pill tone="warn">规划中</Pill>],
            ["循环检测", "Manus / Anthropic", "反馈去重；同一根因重复触发告警", <Pill tone="warn">规划中</Pill>],
            ["上下文压缩", "compaction / reset", "Release 详情页只显示 diff 而非全量配置", <Pill tone="warn">规划中</Pill>],
            ["目标完成校验", "Oracle L3", "Release 通过前跑回归（agent 自审 + 历史工单 replay）", <Pill tone="bad">未做（P1）</Pill>],
            ["外部怀疑式评估", "Anthropic Evaluator", "Release 审批前加 agent 互审（4 标准打分）", <Pill tone="bad">未做（P1）</Pill>],
          ]}
        />
      </Section>

      <Section
        title="⑥ 横向对比：六种 loop 实现"
        description="把上面讨论的 + 几个未展开的放在一起，看清「loop 这个产品」的全貌。"
      >
        <Table
          head={["系统", "loop 原语", "规划", "多 Agent", "终止", "亮点"]}
          rows={[
            ["ReAct", "Thought→Action→Observation", "内联推理", "否", "Finish[] / max-iter", "奠基范式"],
            ["Anthropic 最小", "while + tools", "模型驱动", "subagent fan-out", <span className="text-xs">stop / max_turns / 预算 / 循环检测 / 压缩</span>, "反对过度工程"],
            ["OpenAI Agents SDK", "Runner loop", "模型驱动", <Pill tone="accent">handoff 一等公民</Pill>, "max_turns / final", "单 loop 即多 Agent"],
            ["Manus", "VM 内 loop", "todo.md 复述", "minimal", "todo 完成 / 预算", <Pill tone="good">上下文工程最深</Pill>],
            ["Claude Research", "嵌套 orchestrator-worker", "lead 规划存 Memory", <Pill tone="accent">fan-out 3-5+</Pill>, "信息充分", "比单 Agent +90.2%"],
            ["LangGraph", "cyclic StateGraph", "条件边", "map-reduce", "END / 递归限", <Pill tone="good">可检查点 / 可恢复</Pill>],
          ]}
        />
        <p className="mt-4 text-xs text-zinc-400">
          想看这些 loop 背后的 harness 工程纪律？前往{" "}
          <a href="/architecture/harness" className="text-[var(--accent)] hover:underline">
            Harness 工程
          </a>
          。想把它们落到 AgentUp 的改进项？前往{" "}
          <a href="/architecture/roadmap" className="text-[var(--accent)] hover:underline">
            改进路线图
          </a>
          。
        </p>
      </Section>

      <Section
        title="⑦ 反直觉最佳实践 · 跨系统汇总"
        description="多家（Manus / Anthropic / OpenAI）独立收敛出的、与直觉相反的工程实践。值得直接采纳，不必重新试错。"
      >
        <Table
          head={["实践", "反直觉之处", "来源"]}
          rows={[
            ["保留失败在上下文，不静默重试", "失败 + 错误栈留在 context，模型隐式降低该动作先验 —— 比擦掉重试更有效", <Pill tone="good">Manus + Anthropic</Pill>],
            ["append-only 上下文 + 稳定前缀", "永不编辑历史 turn；追加在末尾 —— 为了 KV-cache 命中（10x 成本差）", <Pill tone="good">Manus</Pill>],
            ["错误作为 observation 直送模型", "不要包装重试逻辑；把错误栈原样回灌，模型自我纠错", <Pill tone="good">Anthropic</Pill>],
            ["用文件系统绕过上下文限制", "别激进压缩；把可恢复内容落文件，只留引用", <Pill tone="good">Manus</Pill>],
            ["分离规划与执行", "让更便宜的模型做规划，强模型做执行 —— 降低成本不降质量", <Pill tone="good">Cursor / Anthropic</Pill>],
            ["引入结构化变异防 rut", "批量任务里用不同序列化/措辞/顺序，防止模型陷入重复模式", <Pill tone="good">Manus</Pill>],
            ["corrections cheap, waiting expensive", "高通量系统里别无限阻塞；flake 用后续 run 解决", <Pill tone="good">OpenAI</Pill>],
          ]}
        />
      </Section>

      <Section
        title="⑧ 参考来源"
        description="本页所有论断的一手出处。点击直达。"
      >
        <References
          items={[
            { title: "ReAct: Synergizing Reasoning and Acting in Language Models (Yao et al. 2022)", url: "https://arxiv.org/abs/2210.03629", note: "arXiv · Agent loop 奠基论文" },
            { title: "Building Effective Agents — Anthropic", url: "https://www.anthropic.com/engineering/building-effective-agents", note: "while + tools 最小范式；7 种终止条件" },
            { title: "Context Engineering for AI Agents — Manus", url: "https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus", note: "上下文工程五个反直觉决策" },
            { title: "The Anatomy of an Agent Loop — Steve Kinney", url: "https://stevekinney.com/writing/agent-loops", note: "生产级终止条件详解" },
            { title: "The Agent Loop Decoded: Three Levels — Oracle", url: "https://blogs.oracle.com/developers/the-agent-loop-decoded-three-levels-every-agent-engineer-must-know", note: "loop 三层；L3 目标完成校验" },
            { title: "openai/swarm — GitHub", url: "https://github.com/openai/swarm", note: "「一个简单 Python loop」" },
            { title: "How We Built Our Multi-Agent Research System — Anthropic", url: "https://www.anthropic.com/engineering/multi-agent-research-system", note: "orchestrator-worker；多 Agent +90.2%" },
            { title: "Cursor 2.0 Agent-First Architecture", url: "https://www.digitalapplied.com/blog/cursor-2-0-agent-first-architecture-guide", note: "并行 worktree + Plan Mode" },
            { title: "LangGraph: Conditional Edge and Loop", url: "https://blog.gopenai.com/conditional-edge-and-cycle-in-langgraph-explained-da4a112bf1ea", note: "cyclic StateGraph + checkpoint" },
          ]}
        />
      </Section>
    </div>
  );
}
