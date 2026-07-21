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
        subtitle="对 AgentUp（Agent 改进平台）做一次整体评估：功能完整性与创意性。并以三层 Loop 为骨架，把项目与业界 Harness / Loop 工程的核心设计对齐。"
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
          L1 对应通用的 <strong>agentic loop</strong>（ReAct / while+tools，见
          <a href="/architecture/loop" className="text-[var(--accent)] hover:underline"> Loop 工程</a>）。L2/L3
          是产品层的 <strong>改进 loop</strong>，本质是给 Agent 这个「运行时」提供一套受控的持续迭代 harness（见{" "}
          <a href="/architecture/harness" className="text-[var(--accent)] hover:underline">Harness 工程</a>）。
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
              <span>「Compile, don't retrieve」—— 先查高质量蒸馏知识，再回退到实时 MCP 数据。WIKI_FIRST / HYBRID 等策略可配。比单纯 RAG 更工程化</span>,
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
                href: "/architecture/loop",
              },
              {
                title: "Harness 工程",
                tag: "深入",
                description:
                  "Harness 五大子系统、OpenAI 百万行 Codex 案例的七大决策、Anthropic Generator/Evaluator 三体设计，映射到 AgentUp 的四分区配置与发布流。",
                href: "/architecture/harness",
              },
              {
                title: "改进路线图",
                tag: "落地",
                description:
                  "把 Harness / Loop 业界经验转化为 AgentUp 的 P0/P1/P2 改进项：来源 → 落点 → 预期收益。",
                href: "/architecture/roadmap",
              },
            ]}
          />
        </div>
      </Section>
    </div>
  );
}
