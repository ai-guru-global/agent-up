/*
 * MOCK 页面：本页 MaaS 产品矩阵、模型用量与路由策略均为演示用 mock 数据，
 * 用于客户现场展示「Agent 持续改进 × 阿里云大模型产品」的结合方式；
 * 真实 DashScope / 百炼接入为下一里程碑，见 docs/superpowers/specs/2026-08-21-maas-integration-mock-design.md。
 * 本页把 JSX 写在 <Table rows={[...]}> 静态数据数组里，Table 内部已统一赋 key，
 * react/jsx-key 无法跨函数边界追踪，属于误报，故豁免。
 */
/* eslint-disable react/jsx-key */
import { Mermaid } from "../../components/mermaid";
import {
  Insight,
  PageHeader,
  Pill,
  Section,
  Table,
} from "../architecture/_components/ui";
import { ConnectivityProbe } from "./connectivity-probe";
import { AgentUsageBlock } from "./usage-block";

const modelRoutingChart = `flowchart LR
  A["工单进入"] --> B{"qwen-turbo\\n意图分类"}
  B -->|"置信度 < 0.3"| H["转人工"]
  B -->|"复杂故障"| C["qwen-max\\n深度推理"]
  B -->|"常规咨询"| D["qwen-plus\\n回答"]
  C --> E{"百炼 RAG\\n检索命中?"}
  D --> E
  E -->|"命中"| F["蒸馏知识作答"]
  E -->|"未命中"| G["MCP 活数据兜底"]
  C -.->|"专有云客户"| P["Apsara Stack\\n私有化推理"]`;

export default function MaasPage() {
  return (
    <div>
      <PageHeader
        title="模型服务（MaaS 集成）"
        badge="MOCK"
        subtitle="展示 agent-up 与阿里云大模型产品的结合方式：MaaS 提供模型引擎，agent-up 管 Agent 的配置·评估·发布·回滚生命周期。公共云走百炼 / DashScope，专有云走 Apsara Stack 私有化推理——同一套改进闭环，两种部署形态。产品矩阵与路由策略为 mock；顶部连通性测试与②用量块（有试聊数据时）为真实数据。"
      />

      <div className="mt-8">
        <ConnectivityProbe />
      </div>

      <p className="mt-6 max-w-3xl rounded-lg border border-dashed border-[var(--border)] px-4 py-3 text-xs leading-relaxed text-[var(--subtle)]">
        怎么读这一页：<strong className="font-semibold text-[var(--muted)]">①</strong> 先看产品矩阵，确认这套改进闭环在公共云与专有云两种形态下分别对接哪些产品；
        <strong className="font-semibold text-[var(--muted)]">②</strong> 再看每个 Agent 的模型消费，判断改进值不值；
        <strong className="font-semibold text-[var(--muted)]">③</strong> 路由图说明「质量 / 成本 / 时延」怎么通过配置而非代码来平衡；
        <strong className="font-semibold text-[var(--muted)]">④</strong> 最后对齐四分区各自的 MaaS 接入点与当前进度。
        除顶部连通性测试与②用量块（有试聊数据时）外，本页数据均为 mock，可安全用于客户现场讲解。
      </p>

      <Section
        title="① 产品矩阵 · 公共云 + 专有云双形态"
        description="同一改进平台对接两种部署形态：公共云客户用百炼 / DashScope 托管服务，专有云客户用 Apsara Stack 集群内私有化推理。模型可换，改进闭环不变。"
      >
        <Table
          caption="公共云与专有云两种部署形态下，各自对接的模型产品、承担的角色，以及对应 agent-up 的哪个配置分区"
          head={["形态", "产品 / 模型", "角色", "对应 agent-up 分区"]}
          rows={[
            [<Pill tone="accent">公共云</Pill>, <span><strong>百炼 Model Studio</strong></span>, "模型服务 + 知识库 RAG + 应用编排入口", "全局（模型选型 / 知识库绑定）"],
            [<Pill tone="accent">公共云</Pill>, <span><strong>DashScope API</strong></span>, "统一推理 API（Qwen 系列 / embedding）", "Prompt / Routing（模型调用）"],
            [<Pill tone="accent">公共云</Pill>, "Qwen-Max", "复杂推理 · 主模型", "Routing（模型路由）"],
            [<Pill tone="accent">公共云</Pill>, "Qwen-Plus / Qwen-Turbo", "成本降级 / 工单意图分类", "Routing（模型路由）"],
            [<Pill tone="accent">公共云</Pill>, "text-embedding-v3 + 百炼 RAG", "向量化 + 知识库检索", "Knowledge / Tools"],
            [<Pill tone="good">专有云</Pill>, <span><strong>Apsara Stack 模型服务</strong>（私有化）</span>, "集群内推理，同口径 Qwen 系列", "Routing（私有化端点）"],
            [<Pill tone="good">专有云</Pill>, "PAI-EAS 推理服务", "模型部署 · 弹性扩缩", "Routing（私有化端点）"],
            [<Pill tone="good">专有云</Pill>, "私有向量检索服务", "集群内 embedding 检索，数据不出域", "Knowledge / Tools"],
          ]}
        />
        <Insight label="SA 视角">
          卖模型只是第一步：<strong>模型是引擎，agent-up 是把引擎变成「持续改进的生产系统」的那层</strong>。客户现场可以指着这张表讲——公共云客户今天用百炼，专有云客户明天私有化，改进闭环（反馈→改配置→审批→发布→回滚）完全复用。
        </Insight>
      </Section>

      <Section
        title="② 每 Agent 模型用量"
        description="把模型消费挂到每个 Agent 上：成本、时延、解决率是跟客户对齐「这次改进值不值」的三个抓手。有试聊数据时本块显示真实聚合（LIVE），无试聊数据时回退 mock 演示口径。"
      >
        <AgentUsageBlock />
      </Section>

      <Section
        title="③ 模型路由策略"
        description="分类用 turbo、推理用 max、降级用 plus——把「质量 / 成本 / 时延」三角变成可配置的路由规则，而不是写死在代码里。这正是 Routing 分区的价值。"
      >
        <Mermaid chart={modelRoutingChart} />
        <Insight label="跟客户讲的故事">
          路由规则是<strong>配置</strong>不是代码：客户觉得成本高，把常规咨询从 plus 降回 turbo，走 Release 审批 → Version 快照 → 可回滚；觉得解决率低，把复杂故障升级到 max。<strong>每一次调整都有审批记录和效果报告</strong>，这是企业级 Agent 运营和个人「prompt 存代码里随手改」的本质区别。
        </Insight>
      </Section>

      <Section
        title="④ 四分区 ↔ MaaS 集成点与演进"
        description="agent-up 的四分区配置，每一分区都有明确的 MaaS 接入点。当前为 mock 口径，真实接入为下一里程碑。"
      >
        <Table
          caption="Prompt、Knowledge、Tools、Routing 四个分区各自的 MaaS 接入点与当前实现状态"
          head={["分区", "MaaS 接入点（mock）", "当前状态"]}
          rows={[
            ["Prompt", "模型人设 / 约束写入 systemPrompt，由 Qwen 系列执行", <Pill tone="warn" title="配置结构与字段口径已按真实接入设计写好，但数据仍是本地 mock">Mock 口径已写入</Pill>],
            ["Knowledge", "百炼 RAG 知识库（公共云）/ 私有向量检索（专有云）", <Pill tone="warn" title="知识条目已按真实结构登记，检索仍走本地实现">Mock 条目已登记</Pill>],
            ["Tools", "DashScope MCP 工具：知识库检索 / text-embedding", <Pill tone="warn" title="工具清单已登记，尚未连接真实 MCP 服务端">Mock 条目已登记</Pill>],
            ["Routing", "模型路由规则：turbo 分类 → max / plus 分流", <Pill tone="accent" title="路由策略可在 Agent 详情页的 Routing 分区实际编辑与演示">策略演示</Pill>],
          ]}
        />
        <Insight label="下一里程碑">
          接入真实 DashScope / 百炼 API，并把 L1 的 trace（检索命中、工具调用、模型回答）回流为反馈证据——届时「复盘有据 → 归因有理 → 加强有验」的闭环才真正闭合。见改进路线图。
        </Insight>
      </Section>
    </div>
  );
}
