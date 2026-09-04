/*
 * 本页大量把 JSX 写在 <Table rows={[...]}> 的静态数据数组里；
 * Table 内部 map 渲染时已统一赋 key（见 _components/ui.tsx），
 * react/jsx-key 无法跨函数边界追踪，属于误报，故在本页豁免。
 */
/* eslint-disable react/jsx-key */
import { Mermaid } from "../../components/mermaid";
import {
  Card,
  Insight,
  NavGrid,
  PageHeader,
  Pill,
  ScoreDots,
  Section,
  Table,
} from "./_components/ui";

const threeLoopsChart = `
flowchart LR
  subgraph L1["L1 · 运行时环"]
    L1a["CRE 工单<br/>Agent 解答"]
    L1b["会话 / 评分"]
  end
  subgraph L2["L2 · 产品改进环（本平台核心）"]
    L2a["反馈收集"]
    L2b["四分区编辑<br/>Prompt/知识/工具/路由"]
    L2c["Release 审批"]
    L2d["Version 快照"]
  end
  subgraph L3["L3 · 智能进化环（规划中）"]
    L3a["跨 Agent 洞察"]
    L3b["知识自动蒸馏"]
  end
  L1b -- "人工反馈" --> L2a
  L2d -- "版本上线" --> L1a
  L2d -- "蒸馏数据" --> L3a
  L3b -- "反哺知识库" --> L2b
  L3a -- "通用改进" --> L2b

  style L2 fill:#dbeafe,stroke:#2563eb,stroke-width:2px
  style L1 opacity:0.85
  style L3 opacity:0.85
`;

const stackModelChart = `
flowchart TB
  subgraph GRAPH["Graph · 跨 Agent 协调"]
    direction TB
    subgraph LOOP["Loop · 驱动单个 Agent 的循环"]
      direction TB
      subgraph HARNESS["Harness · 工具 · 记忆 · 错误处理"]
        direction TB
        subgraph CONTEXT["Context · 模型看到的一切"]
          direction TB
          subgraph PROMPT["Prompt · 你发送的话"]
            MODEL["Model · 模型本身（可插拔）"]
          end
        end
      end
    end
  end

  style LOOP fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#1e3a5f
`;

const fourPartitionChart = `
flowchart TB
  A(("Agent<br/>一张配置卡"))
  A --> P["Prompt 分区<br/>系统提示词 · 角色 · 约束<br/>「性格与纪律」"]
  A --> K["Knowledge 分区<br/>Wiki 蒸馏知识优先<br/>MCP 活数据兜底<br/>「长期记忆」"]
  A --> T["Tools 分区<br/>MCP 工具 + Wiki 查询<br/>「手」"]
  A --> R["Routing 分区<br/>工单分类 · 转人工阈值<br/>「分诊台」"]

  style K fill:#dbeafe,stroke:#2563eb
`;

const radarChart = `
flowchart TD
  center(("AgentUp<br/>MVP"))
  center --> D1["数据层<br/>2/5"]
  center --> D2["Agent 配置<br/>5/5"]
  center --> D3["发布流<br/>4/5"]
  center --> D4["Skills<br/>3/5"]
  center --> D5["Wiki<br/>3/5"]
  center --> D6["反馈环<br/>3/5"]
  center --> D7["RBAC<br/>2/5"]
  center --> D8["可观测性<br/>1/5"]

  style D2 fill:#dbeafe,stroke:#2563eb
  style D3 fill:#dbeafe,stroke:#2563eb
  style D8 stroke:#a1a1aa,stroke-dasharray:4 3
`;

export default function ArchitectureOverviewPage() {
  return (
    <div>
      <PageHeader
        title="架构总览"
        badge="项目评估"
        subtitle="对 AgentUp（Agent 改进平台）做一次整体评估：设计理念科普、功能完整性与创意性、与行业最佳实践的差距。以三层 Loop 为骨架，把项目与业界 Harness / Loop 工程的核心设计对齐。全文对应报告：docs/reports/2026-07-31-project-evaluation-and-industry-gap-analysis.md。"
      />

      <Section
        title="项目定位"
        description="AgentUp 是面向私有云工单团队的「Agent 持续改进管理平台」。每个产品线（ECS / RDS …）有一个 on-duty Agent，CRE 使用它解决客户工单；产品组基于反馈不断改进 Agent（Prompt / 知识 / 工具 / 路由），并通过审批流上线。Agent 是集中部署的「值班顾问」，不直接操作客户的私有云。"
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              首发范围
            </p>
            <p className="mt-1.5 text-sm font-semibold text-[var(--foreground)]">
              子项目 B + D
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">改进工作台 + 统一 Web</p>
          </Card>
          <Card>
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              技术栈
            </p>
            <p className="mt-1.5 text-sm font-semibold text-[var(--foreground)]">
              Next.js 16 · TS 5
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">Turborepo · Tailwind v4</p>
          </Card>
          <Card>
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              设计骨架
            </p>
            <p className="mt-1.5 text-sm font-semibold text-[var(--foreground)]">
              三层 Loop · 四分区配置
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">L1/L2/L3 · Prompt/知识/工具/路由</p>
          </Card>
          <Card>
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              MVP 角色
            </p>
            <p className="mt-1.5 text-sm font-semibold text-[var(--foreground)]">
              工单团队 / 产品组 / CRE
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">扩展设计含 7 角色</p>
          </Card>
        </div>
      </Section>

      <Section
        title="三层 Loop · 数据流全景"
        description="本平台的设计核心是「时间尺度不同的三层 Loop」。L1 是 Agent 实时解答工单（不在此平台构建）；L2 是产品组基于反馈改进 Agent —— 这是本平台的核心；L3 是跨 Agent 智能进化（规划中）。三层通过数据管道耦合。"
      >
        <Mermaid chart={threeLoopsChart} />
        <Insight label="与业界 Loop 工程的关系">
          L1 对应通用的 <strong>agentic loop（智能体循环）</strong>，如 ReAct / while+tools（见
          <a href="/architecture/loop/" className="text-[var(--accent)] hover:underline"> Loop 工程</a>）。L2/L3
          是产品层的 <strong>改进循环</strong>，本质是给 Agent 这个「运行时」提供一套受控的持续迭代 harness（执行框架，见{" "}
          <a href="/architecture/harness/" className="text-[var(--accent)] hover:underline">Harness 工程</a>）。
        </Insight>
      </Section>

      <Section
        title="六层参考模型 · Model 之外，都是改进空间"
        description="业界把 Agent 技术栈画成六层嵌套（常见心智模型，本图重绘）——每一层包住下面一层：模型在最内层，外面依次包着 Prompt（提示词）、Context（上下文）、Harness（执行框架）、Loop（循环）、Graph（编排）。AgentUp 不造模型，治理的是模型以外的各层。"
      >
        <Mermaid chart={stackModelChart} />
        <Table
          head={["技术栈层", "对应 agent-up 能力", "现状"]}
          rows={[
            ["Model", "MaaS 模型服务（LLM 网关）", "小米 MiMo 已真实接入（4×LIVE）；百炼 / 专有云是下一份网关配置"],
            ["Prompt", "Prompt 分区", "角色 · 约束 · 输出格式，分区编辑 + 独立回滚"],
            ["Context", "Knowledge 分区", "两层知识架构：蒸馏态（Wiki）优先，MCP 活数据兜底"],
            ["Harness", "Tools 分区 + 结构化错误体系", "MCP 工具配置 + 全站统一错误分类"],
            [
              <strong>Loop</strong>,
              "反馈 → AI 归因 → 审批发布 → 效果报告 → 一键回滚",
              "L2 产品改进环，本平台核心（对应上图高亮层）",
            ],
            ["Graph", "跨 Agent 洞察", "L3 智能进化环，预留"],
          ]}
        />
        <Insight label="「模型可换，闭环不变」的结构性原因">
          模型只是最内层节点，AgentUp 治理的是包住它的各层。换 Provider 只动最内层——外面的治理资产（四分区配置、版本快照、审批流、效果报告）原样保留。
        </Insight>
      </Section>

      <Section
        title="四分区配置 · 一个 Agent = 一张配置卡"
        description="把一个 Agent 的全部可改项收敛为四个分区，降低非开发者（产品组 / 工单团队）的认知负担。每个分区独立计版本，变更粒度决定 Release 的语义化版本号。"
      >
        <Mermaid chart={fourPartitionChart} />
        <Table
          head={["分区", "内容", "类比", "改它的典型场景"]}
          rows={[
            [
              <strong>Prompt（提示词）</strong>,
              "系统提示词、角色设定、约束条件、输出格式",
              "Agent 的「性格与纪律」",
              "回答风格不对、越界承诺、格式混乱",
            ],
            [
              <strong>Knowledge（知识）</strong>,
              "指向 Wiki vault；两层知识架构：蒸馏态知识优先检索，MCP 工具兜底查活数据",
              "Agent 的「长期记忆」",
              "知识缺失、知识过期、检索不中",
            ],
            [
              <strong>Tools（工具）</strong>,
              "MCP 工具配置 + Wiki 查询工具（index/summary/grep/全页读取逐级升级）",
              "Agent 的「手」",
              "工具调用失败、缺少某类能力",
            ],
            [
              <strong>Routing（路由）</strong>,
              "工单分类规则、分派策略、转人工阈值、升级策略",
              "Agent 的「分诊台」",
              "不该接的接了、该转人工没转",
            ],
          ]}
        />
        <Insight label="为什么是四个分区">
          复盘一张失败工单时，归因结论最终都会落到某个分区：知识缺失 → Knowledge，工具失败 → Tools，回答越界 → Prompt，分派错误 → Routing。
          <strong>四分区同时是配置模型和归因分类学</strong>，这是它比「把配置散落在不同页面」更深的价值。
        </Insight>
      </Section>

      <Section
        title="功能完整性 · 八维评分"
        description="结合代码与设计文档的实读结果评分。评分相对「设计目标」而非「同类产品」—— 5 表示设计目标已基本落地。"
      >
        <Table
          head={["维度", "评分", "现状", "关键缺口"]}
          rows={[
            [
              "Agent 配置（四分区）",
              <ScoreDots score={5} />,
              <span>Prompt / 知识 / 工具 / 路由 四分区编辑器全部实现；分区级 <code className="rounded bg-[var(--surface-elevated)] px-1">version</code> 字段已有</span>,
              "草稿态（AgentDraftConfig）未真正启用，当前直接写 active",
            ],
            [
              "发布流（Release → Version）",
              <ScoreDots score={4} />,
              <span>提交 → 审批 → 通过后生成不可变 Version 快照（语义化版本）已跑通</span>,
              "无 diff 查看器、无分区级回滚、无灰度（Canary）",
            ],
            [
              "Skills 体系",
              <ScoreDots score={3} />,
              "Skill 注册表 + Agent 绑定/解绑 + 类别/运行时模型齐全",
              "无沙箱执行、无市场、MCP/Workflow 运行时仅建模",
            ],
            [
              "Wiki 知识库",
              <ScoreDots score={3} />,
              <span>采用 llm-wiki「蒸馏知识网络」模式：vault → page，含 provenance / lifecycle / tier 元数据</span>,
              <span><strong>蒸馏引擎未实现</strong>（WikiIngestJob 仅有模型）；无 Git 版本化；无跨 vault 共享概念池</span>,
            ],
            [
              "反馈闭环",
              <ScoreDots score={3} />,
              <span>反馈 CRUD、根因分析字段、与 Release 关联齐全</span>,
              <strong>L1 自动采集管道缺失（手动录入）</strong>,
            ],
            [
              "RBAC / 审计",
              <ScoreDots score={2} />,
              "数据模型完整（Role/Permission/UserRole/AuditLog），UI 可见",
              <span><strong>没有真鉴权</strong>（login 是 stub）；RBAC 未在 API 强制；审计日志未真正写入</span>,
            ],
            [
              "数据持久化",
              <ScoreDots score={2} />,
              "Prisma schema 626 行、30 个模型已就绪",
              <span><strong>运行时用的是 JSON 文件</strong>，Prisma 完全没接；无迁移</span>,
            ],
            [
              "可观测性 / 效果度量",
              <ScoreDots score={1} />,
              "仅 dashboard 聚合统计 + 审计日志数据",
              <strong>无发布后 7 天效果报告、无改进看板、无指标埋点</strong>,
            ],
          ]}
        />
      </Section>

      <Section
        title="创意性评估"
        description="AgentUp 在「Agent 产品改进」这个细分领域里的差异化设计。"
      >
        <Table
          head={["设计点", "创意度", "对比同类（LangGraph / Dify / Cursor Agent 配置）"]}
          rows={[
            [
              <span><strong>四分区 Agent 配置面板</strong><br /><span className="text-xs text-zinc-400">Prompt / 知识 / 工具 / 路由 一面板四 Tab</span></span>,
              <Pill tone="good">高</Pill>,
              "多数平台把这几项散落在不同页面；AgentUp 用「一个 Agent = 一张配置卡」显著降低非开发者认知负担 —— 这是对目标用户（产品组、工单团队）的精准设计",
            ],
            [
              <span><strong>两层知识架构</strong><br /><span className="text-xs text-zinc-400">Wiki 蒸馏优先，MCP 工具兜底</span></span>,
              <Pill tone="good">高</Pill>,
              <span>「Compile, don&apos;t retrieve」—— 先查高质量蒸馏知识，再回退到实时 MCP 数据。WIKI_FIRST / HYBRID 等策略可配。比单纯 RAG 更工程化</span>,
            ],
            [
              <span><strong>三层 Loop 时间尺度</strong><br /><span className="text-xs text-zinc-400">L1 分钟 / L2 小时天 / L3 周月</span></span>,
              <Pill tone="good">高</Pill>,
              "把 Agent 的「运行 loop」与「改进 loop」明确分层耦合，是这个垂直场景里少见的清晰框架（详见 Loop 工程页）",
            ],
            [
              <span><strong>Release → 不可变 Version 快照</strong></span>,
              <Pill tone="accent">中高</Pill>,
              "借鉴 Git/CI 思想做 Agent 配置版本化，配合一键回滚。是改进平台该有的工程素养",
            ],
            [
              <span><strong>反馈 → 知识蒸馏入口</strong></span>,
              <Pill tone="warn">中（设计中）</Pill>,
              "把一条反馈喂给 wiki-ingest 产出草稿页 —— 是 L3 的轻量入口，但当前未实现",
            ],
            [
              <span><strong>Sandbox 技能执行</strong></span>,
              <Pill tone="bad">低（未做）</Pill>,
              "Skills 仅有元数据，无安全执行环境 —— 这是相对 smolagents / Codex 的明显短板",
            ],
          ]}
        />

        <Mermaid chart={radarChart} className="mt-6" />
        <Insight label="一句话结论">
          <strong>设计成熟度高于实现成熟度</strong>。文档里的架构判断（三层 Loop、四分区、两层知识）是有创意且贴场景的；
          但工程上把「设计已就绪、运行时未接通」的债务（Prisma 未用、鉴权 stub、审计未写、蒸馏引擎缺位）补齐，才是从 MVP 走向可上线的第一要务。
        </Insight>
      </Section>

      <Section
        title="成熟度画像 · 设计 vs 实现"
        description="平台叫「Agent 持续改进」，但目前只能管理「改进的记录」（Feedback 单据、Release 审批单），不能执行「改进的分析和验证」—— 改进的智力劳动 100% 还在人脑里。这是当前最核心的矛盾。"
        source="docs/reports/2026-07-31 评估报告 · 第一章"
      >
        <Table
          head={["维度", "评级", "证据"]}
          rows={[
            ["概念设计（三层 Loop / 四分区 / Release→Version）", <ScoreDots score={5} />, "MVP 设计文档完整、逻辑自洽"],
            ["数据模型", <ScoreDots score={4} />, "Prisma schema 626 行 30 个模型，覆盖全域"],
            ["配置版本控制", <ScoreDots score={4} />, "SemVer 自动计算 + 不可变快照 + 回滚，超过多数同类工具"],
            ["数据持久化", <ScoreDots score={2} />, "Prisma schema 就绪但运行时全是 JSON 文件"],
            ["认证 / RBAC", <ScoreDots score={1} />, "login 是 stub，身份从请求头透传，任何人可任意角色操作"],
            [<strong>LLM / 评测 / 复盘自动化</strong>, <ScoreDots score={0} />, <strong>全项目没有一行 LLM 调用代码，没有 eval 框架，没有根因分析实现</strong>],
            ["可观测性 / 效果度量", <ScoreDots score={1} />, "仅 dashboard 聚合统计，无发布前后效果对比"],
          ]}
        />
      </Section>

      <Section
        title="与行业最佳实践的差距"
        description="对照业界 Agent/LLM 应用持续改进的主流做法（LangSmith / Langfuse / Braintrust 类平台、OTel GenAI 语义规范、eval-driven development），按重要性排序的五大差距。"
        source="docs/reports/2026-07-31 评估报告 · 第二章"
      >
        <Table
          head={["#", "差距", "业界做法", "本项目现状"]}
          rows={[
            [
              <Pill tone="bad">1</Pill>,
              <span><strong>没有 Trace，复盘无据可依</strong><br /><span className="text-xs text-zinc-400">最致命</span></span>,
              "每次交互记录完整 trace：query、检索了哪些文档及得分、调了哪些工具、最终回答。复盘第一步永远是看 trace",
              "Feedback 只有 sessionData 自由文本，靠人手工粘贴会话片段；没有检索轨迹，无法回答「语料里有没有、检索到没有」",
            ],
            [
              <Pill tone="bad">2</Pill>,
              <strong>没有失败归因分类学（Error Analysis）</strong>,
              "对失败案例系统性归因（open coding → 失败模式分类），每类失败对应不同修复动作；「eval 之前先做 error analysis」",
              "tags（KNOWLEDGE_GAP/TOOL_FAILURE）和 targetPartition 骨架有了，但归因过程纯靠人拍脑袋填",
            ],
            [
              <Pill tone="bad">3</Pill>,
              <span><strong>没有 Golden Set 和回归评测</strong><br /><span className="text-xs text-zinc-400">发布审批是「盲批」</span></span>,
              "失败案例沉淀为评测集；改动发布前跑回归评测（正确率/检索命中率/RAGAS 类指标）作为发布门禁",
              "Release 审批只看人写的 changeNote 和 diff —— 不知道改动是否真修复了那张工单，更不知道有没有改坏之前能答的",
            ],
            [
              <Pill tone="warn">4</Pill>,
              <strong>知识蒸馏闭环只有数据模型，没有引擎</strong>,
              "从失败 case 自动起草知识条目 → 人审 → 入库 → 验证，形成数据飞轮",
              "Wiki 模型设计很好（provenance/lifecycle/tier/confidence），但蒸馏引擎、confidence 计算、wiki-lint 全部未实现",
            ],
            [
              <Pill tone="warn">5</Pill>,
              <strong>工程基线不达生产标准</strong>,
              "真实认证、数据库持久化、CI/CD、审计入库",
              "若近期是个人/小团队内部使用，此项优先级应低于差距 1-3 ——「匹配阶段」也是最佳实践",
            ],
          ]}
        />
        <Insight label="做得比业界平均水平好的地方">
          四分区 + SemVer 版本快照 + 审批回滚，比多数团队「prompt 存在代码里随手改」规范；
          Feedback 状态机与 Wiki 页面元数据（provenance/lifecycle/tier）在概念上领先，只欠落地；
          统一错误体系 + Zod 全量校验 + <strong>181 个测试 / 94% 覆盖</strong>的工程纪律。
        </Insight>
      </Section>

      <Section
        title="关键技术债与风险点"
        source="docs/reports/2026-07-31 评估报告 · 第四章"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-500">安全风险</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--foreground)]">
              无认证/授权，任何用户可篡改数据。内部单用户阶段可容忍，<strong>多人使用前必须补</strong>。
            </p>
          </Card>
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500">可扩展性风险</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--foreground)]">
              JSON 文件无法支撑多实例部署和并发写入；评测集与 trace 数据量上来后必然撑不住，届时 Prisma 落地升为高优。
            </p>
          </Card>
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500">功能风险</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--foreground)]">
              核心设计（蒸馏、自动采集、效果度量、Evaluator）未实现，平台价值打折 —— 「智能核」缺失。
            </p>
          </Card>
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">工程风险</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--foreground)]">
              无 CI/CD、无监控告警、无数据备份；多人同时编辑同一 Agent 可能相互覆盖。
            </p>
          </Card>
        </div>
      </Section>

      <Section
        title="关键缺口 Top 5（影响力 × 实现成本）"
        description="下表直接影响「能否真正上线」。详细改进路线见 改进路线图 页。"
      >
        <Table
          head={["#", "缺口", "影响", "建议落点"]}
          rows={[
            [<Pill tone="bad">P0</Pill>, "数据层：JSON 文件 → Postgres/Prisma", "无法多实例、无并发安全、无审计基础", "接通已就绪的 Prisma schema + 迁移"],
            [<Pill tone="bad">P0</Pill>, "鉴权与 RBAC 强制", "当前任意人可改任意 Agent", "落地 NextAuth + 中间件 + API 级 ACL"],
            [<Pill tone="warn">P1</Pill>, "Wiki 蒸馏引擎", "两层知识架构的核心一半未实现", "WikiIngestJob 接 LLM + provenance"],
            [<Pill tone="warn">P1</Pill>, "L1 反馈自动采集", "改进 loop 的输入仍靠手填", "会话评分 → 反馈自动入库"],
            [<Pill tone="warn">P2</Pill>, "发布效果度量 + 回滚 UX", "改了不知道好坏，出问题不能一键回退", "7 天报告 + diff 查看器 + 分区回滚"],
          ]}
        />
        <div className="mt-8">
          <NavGrid
            items={[
              {
                title: "Loop 工程",
                tag: "深入",
                description:
                  "通用 agentic loop（ReAct / Anthropic while+tools / Manus context loop / OpenAI Swarm）的设计核心，以及 AgentUp 三层 Loop 如何与之对齐。",
                href: "/architecture/loop/",
              },
              {
                title: "Harness 工程",
                tag: "深入",
                description:
                  "Harness 五大子系统、OpenAI 百万行 Codex 案例的七大决策、Anthropic Generator/Evaluator 三体设计，映射到 AgentUp 的四分区配置与发布流。",
                href: "/architecture/harness/",
              },
              {
                title: "改进路线图",
                tag: "落地",
                description:
                  "把 Harness / Loop 业界经验转化为 AgentUp 的 P0/P1/P2 改进项：来源 → 落点 → 预期收益。",
                href: "/architecture/roadmap/",
              },
            ]}
          />
        </div>
      </Section>
    </div>
  );
}
