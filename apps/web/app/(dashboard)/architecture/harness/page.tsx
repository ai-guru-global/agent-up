/*
 * 本页大量把 JSX 写在 <Table rows={[...]}> 的静态数据数组里；
 * Table 内部 map 渲染时已统一赋 key（见 _components/ui.tsx），
 * react/jsx-key 无法跨函数边界追踪，属于误报，故在本页豁免。
 */
/* eslint-disable react/jsx-key */
import { Mermaid } from "../../../components/mermaid";
import { Card, Insight, PageHeader, Pill, References, Section, Table } from "../_components/ui";

const harnessFiveSubsystems = `
flowchart LR
  subgraph SC["Scaffolding · 行为定义层"]
    SP["system_prompt"]
    TD["tool_descriptions"]
    CM["上下文/记忆管理"]
  end

  subgraph HZ["Harness · 执行层"]
    OL["编排循环<br/>observe→think→act"]
    TE["工具执行器<br/>路由调用 + 回灌结果"]
    TC["终止控制<br/>目标完成校验"]
    EH["错误处理 + 护栏"]
  end

  M["LLM Model<br/>text in → text out"]
  MEM[("Memory<br/>短期 in-context<br/>长期 external")]
  TOOLS[("Tools<br/>API / FS / 代码解释器<br/>浏览器 / 检索")]

  SC --> M
  OL <--> M
  OL --> TE <--> TOOLS
  OL <--> MEM
  CM <--> MEM
  OL --> TC
  OL --> EH

  style HZ fill:#dbeafe,stroke:#2563eb,stroke-width:2px
`;

const anthropicThreeAgent = `
sequenceDiagram
    autonumber
    participant U as 用户<br/>(1-4 句)
    participant P as Planner
    participant G as Generator
    participant E as Evaluator<br/>(Playwright MCP)
    U->>P: 简短 prompt
    P-->>G: 完整 spec（雄心范围，<br/>仅高层技术，无细节）
    loop 每个 sprint / 特性
        G->>E: 提议 sprint contract<br/>（什么算"完成"+ 可测行为）
        E->>G: 审查 / redline
        G->>G: 实现一个特性
        G->>E: 交付
        E->>E: 点击活页面、截图、按 4 标准打分
        E->>G: 详细的 bug 反馈 vs 契约
    end
    G-->>U: 可发布的应用
`;

const openaiSevenDecisions = `
flowchart TD
  E["工程师的新角色"] --> D1["① Repo 即真相源<br/>AGENTS.md ~100 行 = 目录"]
  E --> D2["② 机械约束架构<br/>linters 强制分层<br/>错误信息 = remediation"]
  E --> D3["③ 让应用对 Agent 可读<br/>每 worktree 可启动<br/>CDP / 可观测接进 runtime"]
  E --> D4["④ Ralph Wiggum 反馈环<br/>本地自审 → 云端 agent 审 →<br/>迭代至 reviewer 满意"]
  E --> D5["⑤ 最小阻塞门禁<br/>corrections cheap, waiting expensive"]
  E --> D6["⑥ 熵清理 / garbage collection<br/>后台 agent 扫偏离<br/>开自动合并的 refactor PR"]
  E --> D7["⑦ 全自主阈值<br/>单 prompt → 复现→修→验→PR→反馈→合并"]

  D2 -.->|生成| L["linters 本身也由 Codex 生成"]
  D4 -.->|演进| D6

  style E fill:#dbeafe,stroke:#2563eb,stroke-width:2px
`;

const agentupMapping = `
flowchart LR
  subgraph HZ["Harness 五子系统"]
    H1["编排循环"]
    H2["工具执行"]
    H3["记忆"]
    H4["上下文/状态"]
    H5["验证/护栏"]
  end

  subgraph AU["AgentUp 对应物"]
    A1["L2: 反馈→编辑→<br/>审批→Version"]
    A2["Skills + MCP<br/>+ Wiki 查询工具"]
    A3["Wiki Vault<br/>（蒸馏记忆）"]
    A4["四分区配置<br/>（Agent 状态）"]
    A5["Release 审批 +<br/>审计日志（规划）"]
  end

  H1 -.- A1
  H2 -.- A2
  H3 -.- A3
  H4 -.- A4
  H5 -.- A5

  style HZ fill:#dbeafe,stroke:#2563eb
`;

const harnessTimeline = `
flowchart LR
  T1["2022 · ReAct<br/>Thought-Action-Observation<br/>奠基范式"] --> T2["2023-24 · 工具调用标准化<br/>function calling + while loop<br/>Anthropic 最小范式"]
  T2 --> T3["2025 · 生产化<br/>Manus 上下文工程<br/>OpenAI 百万行 Codex"]
  T3 --> T4["2026 · 多 Agent + 评估分离<br/>Anthropic Generator/Evaluator<br/>Claude Research fan-out"]
  T4 --> T5["未来 · 模型更强<br/>harness 简化<br/>「有趣的组合在移动」"]

  style T3 fill:#dbeafe,stroke:#2563eb
  style T4 fill:#dbeafe,stroke:#2563eb
`;

const smolagentsArch = `
flowchart TD
  BASE["MultiStepAgent<br/>通用基类：驱动 step loop"] --> CA["CodeAgent<br/>动作 = Python 代码片段"]
  BASE --> TA["ToolCallingAgent<br/>动作 = 结构化 JSON 调用"]
  CA --> CA1["沙箱 Python 解释器<br/>local / E2B / Docker / Blaxel"]
  TA --> TA1["路由到函数<br/>无代码执行"]
  CA --> CA2["表达力高<br/>能循环/组合/变换"]
  TA --> TA2["表达力低<br/>原子调用，无控制流"]
  CA --> CA3["安全风险<br/>需沙箱 + import 白名单"]
  TA --> TA3["安全<br/>schema 校验，无任意代码"]
  TERM["终止：final_answer() 或 max_steps"] -.-> BASE
  CHECKS["final_answer_checks<br/>校验器可拒绝并强制继续"] -.-> BASE
  style CA fill:#dbeafe,stroke:#2563eb
  style TERM fill:#dbeafe,stroke:#2563eb
`;

export default function HarnessEngineeringPage() {
  return (
    <div>
      <PageHeader
        title="Harness 工程"
        badge="设计核心"
        subtitle="「Harness」是包裹 LLM 的执行层 —— 它调用模型、处理工具调用、决定何时停止。在 Hugging Face 的术语里：Agent = Model + Harness。本页展示业界 Harness 设计的核心，重点参考 OpenAI 的《Harness Engineering》（百万行 Codex 案例）和 Anthropic 的 Planner/Generator/Evaluator 三体设计，并映射到 AgentUp 自身的工程结构。"
      />

      <Section
        title="0 · Harness 工程演进时间线"
        description="从 2022 年 ReAct 奠基到今天，harness 工程经历了四个阶段。理解这条脉络，能判断哪些设计是「模型弱时的权宜之计」（会随模型升级而过时），哪些是「长期价值」。"
      >
        <Mermaid chart={harnessTimeline} />
        <Table
          head={["阶段", "年代", "核心问题", "代表"]}
          rows={[
            ["奠基", "2022", "怎么让 LLM 边推理边行动", "ReAct"],
            ["标准化", "2023-24", "工具调用格式统一；最小可用范式", "function calling（函数调用）/ Anthropic while+tools"],
            ["生产化", "2025", "长任务不崩；成本可控；工程纪律", <span>Manus / <strong>OpenAI 百万行 Codex</strong></span>],
            ["多 Agent + 评估分离", "2026", "专业化协作；生成/评估分离", <span><strong>Anthropic Generator/Evaluator</strong> / Claude Research</span>],
          ]}
        />
        <Insight label="时间线的启示">
          每个阶段解决的「模型做不到的事」都在减少。Anthropic 的 meta-lesson：harness 里每个组件都编码了一条「模型独自做不到」的假设——<strong>模型越强，harness 越简</strong>。所以做 harness 工程要留「可拆卸」的余地，定期重评。
        </Insight>
      </Section>

      <Section
        title="① 术语 · Scaffold（脚手架）vs Harness（执行框架）"
        source="HuggingFace《Agent Glossary》术语表"
        description="业内术语正在收敛。把这两个词分清，是讨论 harness 工程的前提。"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Scaffolding · 行为定义层
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--foreground)]">
              决定模型「怎么看待世界」的部分：system prompt（系统提示词）、tool descriptions（工具描述）、响应解析规则、上下文与记忆管理。塑造模型的行为。
            </p>
          </Card>
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
              Harness · 执行层
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--foreground)]">
              决定「怎么跑」的部分：调用模型、处理工具调用、决定何时停。Harness 工程就是把这个执行层设计好：停止条件、错误处理、护栏。
            </p>
          </Card>
        </div>
        <Table
          head={["术语", "一句话定义"]}
          rows={[
            ["Model（模型）", "LLM 本身 —— 文本进文本出，调用间无记忆，只能「表达」调用工具的意图"],
            ["Policy（策略）", "Agent 在给定情境下遵循的行为 —— 部分在权重里，部分在 scaffold+harness 里"],
            ["Orchestrator（编排器）", "更高层控制器，把多个 Agent 当单元管理；每个 Agent 跑自己的 harness"],
            ["Sub-agent（子智能体）", "被另一个 Agent 调用的 Agent；有独立 model + scaffold，独立推理"],
          ]}
        />
        <Insight label="为什么要分清">
          工程师讨论「改 Agent 行为」时常把整个东西叫 harness，但<strong>窄义区分在训练管道和「把行为与执行分开推理」时最关键</strong>。AgentUp 的四分区配置（Prompt / 知识 / 工具 / 路由）本质是在改 <strong>scaffold</strong>；而 Release 审批 + Version 快照是在管 <strong>harness 的版本</strong>。
        </Insight>
      </Section>

      <Section
        title="② Harness 五大子系统（业界共识）"
        source="Akshay Pachaar / Daily Dose of DS / Firecrawl"
        description="综合多个架构拆解，harness 一致地分解为五个子系统。业界还把 agent loop 分为三层——第 3 层「目标完成校验」是最被低估、也是最大的改进杠杆。"
      >
        <Mermaid chart={harnessFiveSubsystems} />
        <Table
          head={["#", "子系统", "职责", "常见失败 / 改进点"]}
          rows={[
            ["1", <span><strong>编排循环</strong><br /><span className="text-xs text-zinc-400">「心跳」</span></span>, "驱动 observe→think→act→observe", "只检查「模型停没停」而非「目标达没达」 —— 三层模型中 L3「目标完成校验」缺位"],
            ["2", <span><strong>工具</strong><br /><span className="text-xs text-zinc-400">「Agent 的手」</span></span>, "执行有副作用的动作", "模型只发意图 → harness 路由 → 回灌结果；参数校验 / 沙箱是重点"],
            ["3", <span><strong>记忆</strong></span>, "短期 in-context + 长期 external", "harness 要主动管理「什么留在上下文」—— Manus 的文件系统即上下文"],
            ["4", <span><strong>上下文/状态</strong></span>, "模型每步看到什么", "渐进式披露 ——「给一张地图，不是 1000 页手册」"],
            ["5", <span><strong>验证 / 护栏</strong></span>, "权限、错误处理、停止条件", "边界校验、linters-as-feedback、Ralph Wiggum loop 检测"],
          ]}
        />
        <Insight label="Agent loop 的三层模型（最重要的元洞察）">
          <strong>L1</strong>：单次 prompt→response（一次 LLM 调用）。<strong>L2</strong>：工具执行循环（模型发 call → 执行 → 回结果）。<strong>L3</strong>：目标完成循环 —— harness 主动检查「目标真的达成了吗」，而不是「模型停了吗」。
          <br />
          <span className="text-zinc-500">绝大多数被低估的工程缺口都在 L3。这也是 OpenAI Codex 案例的「Ralph Wiggum loop」和 Anthropic Evaluator 要解决的核心问题。</span>
        </Insight>
      </Section>

      <Section
        title="③ OpenAI · Harness Engineering 七大决策（百万行 Codex 案例）"
        source="OpenAI《Harness Engineering》官方博客"
        description="5 个月、3 名（后增至 7 名）工程师，用 Codex 写出约 100 万行代码、合并约 1500 个 PR，0 行手写。核心论断：「人类转向，Agent 执行」。工程师的职责从「写代码」变成「设计环境、表达意图、构建反馈环」。"
      >
        <Mermaid chart={openaiSevenDecisions} />
        <Table
          head={["#", "决策", "核心理念", "对 AgentUp 的启发"]}
          rows={[
            ["1", <span><strong>Repo 即真相源 + 渐进披露</strong></span>, "AGENTS.md ≈100 行做目录，深度知识放 docs/。理由：巨型指令会挤占任务上下文、变成「全重要=无指引」、立刻腐烂、无法机械验证", "AgentUp 的四分区 Prompt 应避免堆砌 —— 把详细约束沉淀到 Wiki，Prompt 只放路由 + 引用"],
            ["2", <span><strong>机械约束架构</strong></span>, "按业务域刚性分层（Types→Config→Repo→Service→Runtime→UI），用 linters 强制；lint 错误信息本身就是给 Agent 的 remediation 指令", "AgentUp 应给 Agent 配置加 schema 校验 + 「为什么拒绝」的可读理由（已有 Zod，可强化错误信息）"],
            ["3", <span><strong>让应用对 Agent 可读</strong></span>, "每个 git worktree（工作树）可启动；Chrome DevTools Protocol 接进 runtime；可观测按 worktree 暴露。不在 repo 里的「等于不存在」", "L1 Agent 应能访问 wiki + MCP；CRE 的反馈应自带可复现的会话/证据，否则对改进者「不可读」"],
            ["4", <span><strong>Ralph Wiggum 反馈环</strong></span>, "Codex 本地自审 → 云端 agent 审 → 响应反馈 → 迭代到 reviewer 满意。逐步把审查推到 agent-to-agent", <span><strong>这正是 L3 Evaluator 的雏形</strong> —— AgentUp 应在 Release 审批前加一道「agent 自审 + agent 互审」</span>],
            ["5", <span><strong>最小阻塞门禁</strong></span>, "PR 短命；test flake 用后续 run 解决而非无限阻塞。理由：高通量系统里 corrections 便宜、waiting 昂贵", "AgentUp 的 Release 审批当前是「人工全阻塞」—— 高频小改应走 fast-track（灰度 + 自动回滚）"],
            ["6", <span><strong>熵清理 / garbage collection</strong></span>, "Agent 会复制仓库里已有的模式（包括坏的）→ 漂移。解法：编码 golden principles + 后台 agent 扫偏离 + 开自动合并的 refactor PR", <span><strong>L3 的关键能力</strong> —— AgentUp 应定期扫描所有 Agent 配置，发现偏离基线的 Prompt/知识并提示</span>],
            ["7", <span><strong>全自主阈值</strong></span>, "单 prompt 可触发：复现 bug→录屏→修→驱动 app 验证→录屏→开 PR→响应反馈→检测构建失败→仅在需判断时升级", "AgentUp 的远期愿景：反馈 → 自动定位分区 → 自动起草改动 → agent 审 → 灰度上线"],
          ]}
        />
        <Insight label="最反直觉的一条">
          OpenAI 在某些情况下<strong>让 Agent 重新实现库的子集，而不是包装上游</strong>（例：自己写一个带并发上限、带完整测试和 OpenTelemetry（可观测遥测）埋点的 map 工具函数，而不是引入 p-limit 这类并发限制库）。理由是「无聊、可组合的技术更容易被 Agent 建模」。
          <span className="text-zinc-500"> → 对 AgentUp：Wiki 蒸馏引擎宁可简单可控，也不要引入复杂的不透明依赖。</span>
        </Insight>
      </Section>

      <Section
        title="③ bis · HuggingFace smolagents · 代码即动作 vs JSON 即动作"
        source="huggingface/smolagents（GitHub 仓库）"
        description="smolagents（约 1000 行）是最干净的开源 harness 参考实现。它用两个 Agent 类体现了 harness 设计的一大分流：CodeAgent（动作=Python 代码）vs ToolCallingAgent（动作=JSON 工具调用）。"
      >
        <Mermaid chart={smolagentsArch} />
        <Table
          head={["维度", "CodeAgent（默认）", "ToolCallingAgent"]}
          rows={[
            ["动作格式", "Python 代码片段", "结构化 JSON 工具调用"],
            ["执行", "沙箱 Python 解释器（local/E2B/Docker）", "路由到函数，无代码执行"],
            ["表达力", <Pill tone="good">高</Pill>, "低（原子调用，无控制流）"],
            ["安全", "需沙箱 + import 白名单", <Pill tone="good">schema 校验，无任意代码</Pill>],
            ["错误处理", "遇非法操作 / Python 错即停", "schema 前置校验"],
            ["最佳场景", "解题/编程；可组合函数", "调度/控制；简单原子 API"],
          ]}
        />
        <Table
          head={["关键原语", "作用"]}
          rows={[
            ["MultiStepAgent", "通用基类，驱动 step loop"],
            ["final_answer()", "显式终止；与 max_steps 共同构成终止控制"],
            ["final_answer_checks", "校验器可拒绝答案并强制继续 —— 目标完成校验的轻量版"],
            ["managed_agents", "多 Agent：manager 把子 Agent 当工具调，各自独立记忆/工具集"],
            ["write_memory_to_messages", "把 logs 压缩成可重新喂入的消息序列"],
          ]}
        />
        <Insight label="对 AgentUp 的启发">
          AgentUp 的「工具」分区当前只有元数据（无执行环境），对标 smolagents 是明显短板。<strong>Skills 沙箱执行</strong>（P2）应参考 smolagents 的分层授权：local 解释器禁危险 import + E2B/Docker 沙箱兜底。而 <strong>final_answer_checks</strong> 对应 AgentUp 应有的「Release 通过前跑回归」。
        </Insight>
      </Section>

      <Section
        title="④ Anthropic · Planner → Generator ↔ Evaluator 三体设计"
        source="anthropic.com/engineering/harness-design-long-running-apps"
        description="受 GAN 启发的三体 harness。解决两个核心问题：(a) 长跑时的上下文一致性；(b) 模型自我评估的偏宽。用「Playwright MCP 点活页面 + 截图 + 打分」的怀疑式 Evaluator，比让 Generator 自我批评有效得多。"
      >
        <Mermaid chart={anthropicThreeAgent} />
        <Table
          head={["角色", "职责", "关键设计"]}
          rows={[
            [<span><strong>Planner（规划者）</strong></span>, "把 1-4 句的 prompt 扩成完整 spec（规格说明）", "雄心范围；只到产品 + 高层技术，不下钻实现 —— 否则错误会级联放大"],
            [
              <span><strong>Generator（生成者）</strong></span>,
              "一次建一个特性",
              <span>与 Evaluator 通过<strong>文件</strong>协商 sprint contract（冲刺契约：什么算做完、有哪些可测行为）；<br />完成后交付给 Evaluator</span>,
            ],
            [
              <span><strong>Evaluator（评估者）</strong></span>,
              "用 Playwright MCP 点活页面、截图、打分、写批评",
              <span>调到「怀疑」而非默认；4 标准里前两个（设计质量、原创性）权重最高 —— 因为这是 Claude 最弱的<br /><strong>不是固定 yes/no 门</strong> —— 仅在任务超出模型独自可靠完成的范围时才值得这个成本</span>,
            ],
          ]}
        />
        <Table
          head={["问题", "解法 A", "解法 B", "Anthropic 的选择"]}
          rows={[
            [
              "长跑上下文一致性",
              <span><strong>Compaction（压缩）</strong><br />就地摘要旧轮次</span>,
              <span><strong>Context reset（上下文重置）</strong><br />清空 + 结构化交接给新 Agent</span>,
              "Opus 4.5/4.6 缓解了 context anxiety（上下文焦虑），reset 可以省略；早期两者结合使用",
            ],
            [
              "自我评估偏宽",
              <span>调 Generator 更挑剔<br /><span className="text-xs text-zinc-400">（很难）</span></span>,
              <span><strong>分离 Generator 与 Evaluator</strong><br />+ 调 Evaluator 怀疑</span>,
              <Pill tone="good">分离 + 怀疑（更可控）</Pill>,
            ],
          ]}
        />
        <Insight label="Anthropic 的 meta-lesson（最重要的一句）">
          <strong>「harness 里的每一个组件，都编码了一条『模型独自做不到』的假设 —— 去压力测试这些假设，它们会随模型升级而过时。」</strong>
          <br />
          Opus 4.6 发布后，Anthropic 直接删掉了 sprint 结构、把 Evaluator 改成单次 end-of-run（整轮结束）。「有趣的 harness 组合不会随模型进步而缩小，而是会移动 —— AI 工程师的工作就是不断找到下一个新颖组合。」
          <span className="text-zinc-500"> → 对 AgentUp：今天为 L1 Agent 设计的护栏，应随基座模型升级而定期重评；Evaluator 的边界是会外移的。</span>
        </Insight>
      </Section>

      <Section
        title="⑤ Harness 哲学 · 三方对比"
        description="OpenAI（repo 即真相源）、Anthropic（生成/评估分离）、smolagents（代码即动作）—— 三种不同的 harness 哲学。"
      >
        <Table
          head={["维度", "OpenAI（Codex）", "Anthropic（三体）", "HuggingFace smolagents"]}
          rows={[
            ["主单元", "Repo + 环境", "Generator↔Evaluator 对", "Agent 类（Code / ToolCalling）"],
            ["分解方式", "业务域分层 + linters", "Planner→Generator→Evaluator", "managed agent 层级"],
            ["记忆策略", "Repo 即真相源；AGENTS.md 当目录", "context reset / compaction；文件交接", "in-context logs + write_memory_to_messages"],
            ["验证", "自定义 linters + 结构测试 + agent reviewers", <Pill tone="good">怀疑式 Evaluator + Playwright MCP</Pill>, "final_answer_checks 校验器"],
            ["错误处理", "corrections cheap, waiting expensive", "sprint 契约失败 → 详细反馈给 Generator", "遇非法操作 / Python 错即停"],
            ["loop 控制", "Ralph Wiggum loop 至 reviewer 满意", "5-15 次 gen 迭代；协商→建→QA", "max_steps + final_answer()"],
            ["权限", "每 worktree 隔离 + 临时可观测", "Playwright 浏览器沙箱", "沙箱 Python（E2B/Docker/local）"],
            [<span><strong>创新论点</strong></span>, <Pill tone="accent">对 Agent 可读 &gt; 人类风格</Pill>, <Pill tone="accent">GAN 式生成/评估分离</Pill>, <Pill tone="accent">代码即动作 &gt; JSON 即动作</Pill>],
          ]}
        />
      </Section>

      <Section
        title="⑥ 映射到 AgentUp · 四分区配置就是 scaffold，发布流就是 harness 版本管理"
        description="把上面所有的 harness 概念对号入座到 AgentUp 的实际工程结构。这是「为什么 AgentUp 是一个 harness 工具」的论证。"
      >
        <Mermaid chart={agentupMapping} />
        <Table
          head={["Harness 子系统", "AgentUp 对应物", "成熟度", "改进方向", "优先级"]}
          rows={[
            [
              <span><strong>编排循环</strong></span>,
              "L2：反馈→根因→编辑分区→Release→审批→Version→回滚",
              <Pill tone="good">较成熟</Pill>,
              "加 fast-track；加「目标完成校验」（Oracle L3）—— Release 通过前先跑回归",
              <Pill tone="accent">P1</Pill>,
            ],
            [
              <span><strong>工具执行</strong></span>,
              "Skills（HTTP/Function/MCP/Workflow）+ Wiki 查询工具 + 两层知识架构",
              <Pill tone="warn">中等</Pill>,
              <span><strong>沙箱执行缺失</strong>（对标 smolagents / Codex）；MCP/Workflow 运行时仅建模</span>,
              <Pill tone="warn">P2</Pill>,
            ],
            [
              <span><strong>记忆</strong></span>,
              "Wiki Vault（蒸馏知识网络，带 provenance/lifecycle/tier）",
              <Pill tone="warn">中等</Pill>,
              <span><strong>蒸馏引擎未实现</strong>（WikiIngestJob 仅有模型）—— 这是 L3 的入口</span>,
              <Pill tone="warn">P2</Pill>,
            ],
            [
              <span><strong>上下文/状态</strong></span>,
              "四分区 Agent 配置（Prompt / 知识 / 工具 / 路由）+ 分区级 version + 草稿态",
              <Pill tone="good">设计成熟</Pill>,
              "草稿态（AgentDraftConfig）未真正启用；当前直接写 active",
              <Pill tone="bad">P0</Pill>,
            ],
            [
              <span><strong>验证/护栏</strong></span>,
              <span>Release 审批（人工门）+ <strong>审计日志（已实现）</strong> + RBAC（建模，未强制）+ Zod 全量校验（已实现）</span>,
              <Pill tone="warn">部分</Pill>,
              <span>鉴权 + RBAC 强制（P0 剩余）；加「外部怀疑式 Evaluator」（Anthropic，P1）</span>,
              <span><Pill tone="bad">P0</Pill> + <Pill tone="accent">P1</Pill></span>,
            ],
          ]}
        />
        <Insight label="最关键的一句对齐">
          OpenAI Harness Engineering 的核心论断「<strong>人类转向，Agent 执行；工程师变成环境/反馈环设计者</strong>」，<strong>恰好就是 AgentUp 这个产品想给「产品组」提供的能力</strong> —— 让非开发者也能像 harness 工程师一样迭代 Agent。所以 AgentUp 的产品价值，本质是「把 harness 工程纪律，产品化给业务团队」。
        </Insight>
        <p className="mt-4 text-xs text-zinc-400">
          想看这些改进项的优先级排序？前往{" "}
          <a href="/architecture/roadmap/" className="text-[var(--accent)] hover:underline">
            改进路线图
          </a>
          。
        </p>
      </Section>

      <Section
        title="⑦ Harness 反模式 · 常见错误"
        description="harness 工程里最常踩的坑。每条都来自公开的事后复盘。对照检查 AgentUp 有没有踩。"
      >
        <Table
          head={["反模式", "后果", "正确做法", "AgentUp 现状"]}
          rows={[
            [
              <span><strong>过度工程化</strong></span>,
              "为简单任务套上全自动 Agent；维护成本高、debug 难",
              "Anthropic：多数场景应是「增强 LLM + 检索 + 工具」，而非全自动",
              <Pill tone="good">克制（L2 是受控改进，非全自动）</Pill>,
            ],
            [
              <span><strong>单一 Agent 塞太多</strong></span>,
              "一个 Agent 干所有事；上下文污染、工具集爆炸",
              "拆成专业化 sub-agent，各自独立记忆/工具集（smolagents managed_agents）",
              <Pill tone="good">已按产品线拆 Agent（ECS/RDS）</Pill>,
            ],
            [
              <span><strong>无目标完成校验</strong></span>,
              "只看「模型停没停」，不看「目标达没达」→ 提前收尾",
              "Oracle L3：harness 主动验证目标达成",
              <Pill tone="bad">缺位（P1 待做）</Pill>,
            ],
            [
              <span><strong>自我评估偏宽</strong></span>,
              "让 Generator 自己审自己 → 识别问题后「说服自己通过」",
              "分离 Generator 与 Evaluator；调 Evaluator 怀疑",
              <Pill tone="bad">当前 100% 人工审（P1 待做 agent 互审）</Pill>,
            ],
            [
              <span><strong>配置漂移无治理</strong></span>,
              "Agent 复制仓库里已有模式（含坏的）→ 越改越乱",
              "OpenAI 熵清理：后台 agent 扫偏离 + 开自动合并的 refactor PR",
              <Pill tone="bad">缺位（P2 待做）</Pill>,
            ],
            [
              <span><strong>harness 组件不随模型升级</strong></span>,
              "为弱模型设计的护栏，在强模型上变成累赘",
              "Anthropic meta-lesson：定期压力测试每个组件的假设",
              <Pill tone="warn">尚未建立重评机制</Pill>,
            ],
          ]}
        />
      </Section>

      <Section
        title="⑧ 按模型升级重评护栏 · 可操作清单"
        description="Anthropic 最重要的 meta-lesson 落地为一张检查表。每次基座模型升级（或季度）过一遍，决定哪些 harness 组件该简化/移除。"
      >
        <Table
          head={["检查项", "问题", "如果模型现在能做到了"]}
          rows={[
            [
              <span><strong>sprint 契约</strong></span>,
              "模型能否自己把任务切成合理块？",
              "删掉 sprint 结构（Anthropic 在 Opus 4.6 删了）",
            ],
            [
              <span><strong>逐 sprint 评估</strong></span>,
              "模型能否在一次 end-of-run（整轮结束）评估里保证质量？",
              "改成单次 end-of-run 评估，省掉中间 QA 轮",
            ],
            [
              <span><strong>context reset（上下文重置）</strong></span>,
              "模型长跑还有 context anxiety（上下文焦虑）吗？",
              "去掉 reset，直接连续跑（Opus 4.5+ 可省）",
            ],
            [
              <span><strong>外部 Evaluator</strong></span>,
              "模型能否可靠地自我批评？",
              "降低 Evaluator 的怀疑度，或只在超阈值时启用",
            ],
            [
              <span><strong>logit masking（屏蔽候选词表）</strong></span>,
              "模型能否自己选对工具？",
              "放宽 mask，减少状态机复杂度",
            ],
            [
              <span><strong>人工审批门</strong></span>,
              "模型的改动是否已足够可靠？",
              "高频小改走 fast-track（灰度+自动回滚），仅大改人工审",
            ],
          ]}
        />
        <Insight label="对 AgentUp 的落地">
          把这张表纳入 AgentUp 的<strong>季度架构评审</strong>：每次基座模型（或 L1 Agent 依赖的模型）升级后，逐项过一遍。尤其「人工审批门」——随着 L1 Agent 改进质量提升，Release 审批的阻塞比例应该逐步下降，更多走 fast-track。
        </Insight>
      </Section>

      <Section
        title="⑨ 参考来源"
        description="本页所有论断的一手出处。点击直达。"
      >
        <References
          items={[
            { title: "Harness design for long-running apps — Anthropic", url: "https://www.anthropic.com/engineering/harness-design-long-running-apps", note: "Planner/Generator/Evaluator 三体设计" },
            { title: "Building Effective Agents — Anthropic", url: "https://www.anthropic.com/engineering/building-effective-agents", note: "while+tools 最小范式；反过度工程" },
            { title: "How we built our multi-agent research system — Anthropic", url: "https://www.anthropic.com/engineering/multi-agent-research-system", note: "orchestrator-worker；token 占 80% 性能方差" },
            { title: "huggingface/smolagents — GitHub", url: "https://github.com/huggingface/smolagents", note: "CodeAgent（代码即动作）与 ToolCallingAgent（JSON 工具调用）；最干净的开源 harness" },
            { title: "The Anatomy of an Agent Harness — Daily Dose of DS", url: "https://blog.dailydoseofds.com/p/the-anatomy-of-an-agent-harness", note: "五大子系统拆解" },
            { title: "anthropics/cwc-long-running-agents — GitHub", url: "https://github.com/anthropics/cwc-long-running-agents", note: "Anthropic 三体设计配套仓库" },
          ]}
        />
      </Section>
    </div>
  );
}
