/*
 * 本页大量把 JSX 写在 <Table rows={[...]}> 的静态数据数组里；
 * Table 内部 map 渲染时已统一赋 key（见 _components/ui.tsx），
 * react/jsx-key 无法跨函数边界追踪，属于误报，故在本页豁免。
 */
/* eslint-disable react/jsx-key */
import { Mermaid } from "../../../components/mermaid";
import { Card, Insight, PageHeader, Pill, Section, Table } from "../_components/ui";

const priorityMatrix = `
quadrantChart
    title 影响力 × 实现成本（右下 = 高性价比优先做）
    x-axis "成本低" --> "成本高"
    y-axis "影响低" --> "影响高"
    quadrant-1 "高影响 / 高成本（战略性投入）"
    quadrant-2 "高影响 / 低成本（立即做）"
    quadrant-3 "低影响 / 低成本（顺手做）"
    quadrant-4 "低影响 / 高成本（暂缓）"
    "鉴权 + RBAC 强制": [0.2, 0.92]
    "Prisma/PG 落地": [0.35, 0.95]
    "审计日志真正写入": [0.22, 0.7]
    "草稿态启用": [0.18, 0.6]
    "外部怀疑式 Evaluator": [0.55, 0.88]
    "Wiki 蒸馏引擎": [0.68, 0.9]
    "L1 自动采集管道": [0.6, 0.82]
    "发布效果 7 天报告": [0.5, 0.72]
    "diff 查看器 + 分区回滚": [0.32, 0.65]
    "灰度发布": [0.62, 0.68]
    "改进看板": [0.3, 0.55]
    "Skill 沙箱执行": [0.78, 0.75]
    "熵清理 agent": [0.72, 0.6]
    "共享概念池": [0.82, 0.5]
`;

const roadmapPhases = `
flowchart LR
  P0["P0 · 可上线基线<br/>~2-3 周"] --> P1["P1 · Harness 纪律<br/>~3-4 周"]
  P1 --> P2["P2 · L3 智能化<br/>~4-6 周"]
  P2 --> P3["P3 · 规模化<br/>季度级"]

  P0 -.-> G0["鉴权/RBAC<br/>Prisma 落地<br/>审计真写<br/>草稿态"]
  P1 -.-> G1["外部 Evaluator<br/>diff/回滚<br/>效果报告<br/>灰度"]
  P2 -.-> G2["Wiki 蒸馏<br/>L1 采集<br/>熵清理<br/>Skill 沙箱"]
  P3 -.-> G3["共享概念池<br/>多租户<br/>开放 API<br/>Skill 市场"]

  style P0 fill:#dbeafe,stroke:#2563eb,stroke-width:2px
`;

const retroFlowChart = `
flowchart LR
  T["失败工单上下文<br/>工单号 · 产品 · 会话 · 检索轨迹"] --> R["复盘引擎<br/>回放检索 + LLM 归因"]
  R --> C1["语料缺失"]
  R --> C2["语料有但检索未命中"]
  R --> C3["语料过期/错误"]
  R --> C4["Skill 缺失/失败"]
  R --> C5["超出能力边界"]
  C1 & C2 & C3 --> W["语料补丁草稿<br/>DRAFT wiki 页 / 变更建议单"]
  C4 --> S["Skill 加强建议"]
  W & S --> REL["Release 审批流"]
  REL --> E["评测集回放<br/>修复 N 张 / 回归 0 张"]
  E -. 每张复盘过的工单沉淀为 eval case .-> E

  style R fill:#dbeafe,stroke:#2563eb,stroke-width:2px
  style E fill:#dbeafe,stroke:#2563eb
`;

export default function RoadmapPage() {
  return (
    <div>
      <PageHeader
        title="改进路线图"
        badge="落地"
        subtitle="把 Harness 工程与 Loop 工程的业界经验，转化为 AgentUp 的 P0/P1/P2/P3 改进项。每一项标注：来源（哪家经验）→ 落点（改哪个模块）→ 预期收益。优先做右下角「高影响 / 低成本」的事。"
      />

      <Section
        title="优先级矩阵 · 影响力 × 实现成本"
        description="右下象限（高影响 / 低成本）是立即该做的；左上（高影响 / 高成本）是战略性投入；右上暂缓。"
      >
        <Mermaid chart={priorityMatrix} />
        <Insight label="矩阵读法">
          <strong>立即做</strong>：鉴权/RBAC、审计真写、草稿态、diff 查看 + 回滚、改进看板。<br />
          <strong>战略性投入</strong>：Prisma 落地、外部 Evaluator、Wiki 蒸馏、L1 自动采集。<br />
          <strong>暂缓</strong>：Skill 沙箱、共享概念池（L3 后期）。
        </Insight>
      </Section>

      <Section
        title="分阶段路线"
        description="从「能上线」到「智能进化」到「规模化」的四阶段。每个阶段都是上一阶段的 prerequisite。"
      >
        <Mermaid chart={roadmapPhases} />
      </Section>

      <Section
        title="P0 · 可上线基线"
        description="不做这些就上不了线。属于工程债清理，创意性低但阻塞一切。本轮 P0 稳定层已完成：审计日志、actor 上下文、Zod 全量校验、错误体系、Release diff/semver 修复、反馈状态机、store 加固、全面测试覆盖。鉴权与 Prisma 落地待后续工程。"
      >
        <Table
          head={["改进项", "来源", "落点", "预期收益"]}
          rows={[
            [
              <span><strong>鉴权 + RBAC 强制</strong></span>,
              <Pill tone="neutral">通用工程</Pill>,
              "NextAuth 5 + 中间件 + API 级 ACL（复用已建模的 Role/Permission/UserRole）",
              "从「任何人可改任何 Agent」到最小权限；为审计提供主体",
            ],
            [
              <span><strong>Prisma / Postgres 落地</strong></span>,
              <Pill tone="neutral">通用工程</Pill>,
              "接通已就绪的 626 行 schema + 首个迁移；把 store.ts 的 JSON 读写替换为 Prisma client",
              "多实例、并发安全、审计基础、为后续所有功能解锁",
            ],
            [
              <span><strong>审计日志真正写入</strong> <Pill tone="good">已完成</Pill></span>,
              <Pill tone="neutral">通用工程</Pill>,
              "audit-service.ts：所有 service 写操作 append 到 settings/audit-logs.json，actor 从请求头解析（为 NextAuth 留接口）",
              "合规 + 事故溯源；Release 审批的可信基础",
            ],
            [
              <span><strong>草稿态（AgentDraftConfig）启用</strong></span>,
              <Pill tone="accent">OpenAI ⑦ 全自主阈值</Pill>,
              "四分区编辑写入 draft；Release 提交时把 draft 提升为 active",
              "改一半的配置不会污染线上；为「目标完成校验」留出预演空间",
            ],
          ]}
        />
      </Section>

      <Section
        title="P1 · Harness 纪律（最有创意性的改进）"
        description="这一档是把 Harness 工程的核心纪律产品化。是 AgentUp 区别于「普通配置后台」的关键，也是创意性最高的改进。"
      >
        <Table
          head={["改进项", "来源", "落点", "预期收益"]}
          rows={[
            [
              <span><strong>外部怀疑式 Evaluator</strong></span>,
              <Pill tone="accent">Anthropic Generator/Evaluator</Pill>,
              <span>Release 提交后、人工审批前，加一道「agent 自审 + agent 互审」：<br />用另一个 Agent 按契约（4 标准：正确性/覆盖/风格/可读）打分 + 写批评；可选 replay 历史工单做回归</span>,
              <span><strong>最大质量杠杆</strong>；把「Ralph Wiggum loop」搬到 Agent 配置上；低 block、高 throughput</span>,
            ],
            [
              <span><strong>目标完成校验（Oracle L3）</strong></span>,
              <Pill tone="accent">Oracle · agent loop 三层</Pill>,
              "Release 通过条件 = 不仅要人工 approve（批准），还要通过一组可测行为（对标 Anthropic 的冲刺契约 sprint contract）",
              "防止「模型停了≠目标达了」；让改进可验证",
            ],
            [
              <span><strong>diff 查看器 + 分区级回滚</strong> <Pill tone="good">已完成</Pill></span>,
              <Pill tone="neutral">OpenAI ① Repo 即真相源</Pill>,
              "复用已有的 lib/diff.ts，做 Release 详情页的 partition diff；Version 快照支持分区级一键回滚",
              "改了能看清、错了能回退；降低审批认知负担",
            ],
            [
              <span><strong>发布效果 7 天报告</strong></span>,
              <Pill tone="neutral">通用可观测</Pill>,
              "Release 通过后定时任务：对比发布前后 7 天的同 Agent 反馈率/严重度/解决率",
              "改进 loop 的「observation（观察结果）」—— 知道改得对不对",
            ],
            [
              <span><strong>灰度发布（Canary）</strong></span>,
              <Pill tone="accent">OpenAI ⑤ 最小阻塞门禁</Pill>,
              "复用已建模的 CanaryRelease/CanaryStage；新 Version 先按 % 灰度，异常自动回滚",
              "「corrections cheap, waiting expensive」—— 高频小改走 fast-track",
            ],
          ]}
        />
        <Insight label="为什么「外部 Evaluator」是 P1 之首">
          Anthropic 的数据：solo agent 20 分钟 $9 出来的东西「看起来对但坏了」；完整 harness 6 小时 $200（20× 成本）出来的是可发布的精品。
          <span className="text-zinc-500"> → AgentUp 的 Release 审批现在 100% 靠人工，是 throughput 瓶颈。加一道 agent Evaluator，是把 OpenAI「逐步把审查推到 agent-to-agent」的纪律落到本平台 —— 这是 AgentUp 最该有的差异化能力。</span>
        </Insight>
      </Section>

      <Section
        title="P2 · L3 智能化（实现三层 Loop 的最后一层）"
        description="这一档兑现「三层 Loop」设计里的 L3，把平台从「改进工具」升级为「自进化系统」。"
      >
        <Table
          head={["改进项", "来源", "落点", "预期收益"]}
          rows={[
            [
              <span><strong>Wiki 蒸馏引擎</strong></span>,
              <Pill tone="accent">Manus ③ 文件系统即上下文 + llm-wiki</Pill>,
              "把 WikiIngestJob 接 LLM：反馈/会话 → 草稿 wiki 页（带 provenance/lifecycle/tier/base-confidence）",
              <span><strong>两层知识架构的核心一半</strong>；「Compile, don&apos;t retrieve」从口号变现实</span>,
            ],
            [
              <span><strong>L1 反馈自动采集管道</strong></span>,
              <Pill tone="accent">通用 loop 改进</Pill>,
              "L1 Agent 会话结束 → 自动抽取（问题/解决路径/CRE 评分）入反馈表",
              <span><strong>改进 loop 的输入不再靠手填</strong>；闭环 L1→L2 数据流</span>,
            ],
            [
              <span><strong>熵清理 agent</strong></span>,
              <Pill tone="accent">OpenAI ⑥ garbage collection</Pill>,
              "定期扫描所有 Agent 配置，发现偏离 golden principles 的 Prompt/知识，开「建议 PR」",
              "防止配置漂移；把 OpenAI 的「tech debt 当高息贷款」纪律产品化",
            ],
            [
              <span><strong>Skill 沙箱执行</strong></span>,
              <Pill tone="accent">smolagents / Codex 沙箱</Pill>,
              "Function/MCP 运行时接到 E2B/Docker 沙箱；按 Skill 类别授权 import 白名单",
              "让「工具」分区真正可执行；当前只有元数据是明显短板",
            ],
            [
              <span><strong>改进看板（Kanban）</strong></span>,
              <Pill tone="neutral">通用</Pill>,
              "把反馈 → 根因 → Release 串成看板视图，按 Agent/分区/状态分组",
              "让 L2 loop 的「进行中工作」可视化",
            ],
          ]}
        />
      </Section>

      <Section
        title="P3 · 规模化（季度级）"
        description="单租户跑通后再做。属于扩展性投入。"
      >
        <Table
          head={["改进项", "来源", "落点"]}
          rows={[
            ["共享概念池（跨 vault 知识共享）", <Pill tone="accent">L3 共享记忆</Pill>, "Wiki Vault 间的概念抽取 + 共享层；解「每个 Agent 重复学同样的基础知识」"],
            ["多租户隔离", <Pill tone="neutral">通用</Pill>, "数据模型加 tenantId；RBAC 升级为租户内 + 跨租户两层"],
            ["开放 API + Webhook", <Pill tone="neutral">通用</Pill>, "让 L1 Agent / 外部系统订阅 Release 事件、查询 Version"],
            ["Skill 市场", <Pill tone="accent">OpenAI ⑦ 全自主</Pill>, "Skill 跨产品组共享；带评分 + 沙箱验证"],
          ]}
        />
      </Section>

      <Section
        title="本轮已完成 · P0 稳定层（2026-07-21）"
        description="在现有 JSON store 上用工程纪律把质量拉满，不换存储、不引外部依赖，全面测试覆盖。"
      >
        <Table
          head={["交付项", "文件", "收益"]}
          rows={[
            [<span><strong>审计日志真正写入</strong></span>, "lib/services/audit-service.ts", "所有写操作 append 到 audit-logs.json；actor 从请求头解析"],
            [<span><strong>actor 上下文</strong></span>, "lib/context.ts", "为 NextAuth 留接口；消除散落硬编码 \"system\""],
            [<span><strong>结构化错误体系</strong></span>, "lib/errors.ts + utils.handleApiError", "AppError 子类映射精确 status；消除 includes(\"不存在\") 字符串匹配"],
            [<span><strong>Zod 全量校验</strong></span>, "lib/schemas.ts + validateBody", "补齐 skill/wiki/role/permission/product-group 全部 schema；消除内联漂移"],
            [<span><strong>Release diff/semver 修复</strong></span>, "release-service.ts + versioning.ts", "changedPartitions 与上一版本真实 diff；无变更拒绝提交；真 SemVer"],
            [<span><strong>反馈状态机</strong></span>, "feedback-service.ts", "非法状态转移（NEW→RESOLVED）被拒"],
            [<span><strong>store 加固</strong></span>, "lib/data/store.ts", "crypto.randomUUID；损坏文件抛 AppError；可测的 _setDataDir"],
            [<span><strong>全面测试覆盖</strong></span>, "lib/__tests__ + app/api/__tests__", <span><strong>279 个测试（含 2 个 Prisma 冒烟测试，需 PG），95.9% 语句覆盖</strong>，含 113 个 API 集成测试</span>],
          ]}
        />
      </Section>

      <Section
        title="本轮已完成 · 评测闭环（2026-09-05）"
        description="试聊 trace 落盘 → 👍/👎 打分 → 沉淀评测用例 → 发布前 AI 评测：用 Release 快照 prompt 回放该 Agent 全部用例、LLM 判官逐条 PASS/FAIL，审批人不再盲批——对应下方 P2「失败工单 → 评测集」的核心闭环，先落地手动沉淀 + 手动触发版。"
      >
        <Table
          head={["交付项", "文件", "收益"]}
          rows={[
            [<span><strong>试聊 trace 落盘 + 打分</strong></span>, "lib/services/trace-service.ts + chat / traces/[id]/rate", "每次成功回复服务端落盘（失败不打断）；Playground 提供 👍/👎（可改分）"],
            [<span><strong>评测用例库</strong></span>, "lib/services/eval-case-service.ts + agents/[id]/eval-cases", "打分后可一键沉淀（自动校验 trace 归属），含完整输入 + 参考回复；种子含 2 条 ECS 用例"],
            [<span><strong>发布前 AI 评测门禁</strong></span>, "lib/services/ai-review-service.ts + releases/[id]/ai-review", "仅 PENDING 可跑：快照 prompt 回放全部用例，判官 PASS/FAIL 写回 aiReview；无配置/无用例自动 SKIPPED，结论不阻断审批"],
            [<span><strong>前端与 Demo 同步</strong></span>, "agent-detail.tsx + releases/page.tsx + demo/mock-server.ts", "Playground 打分/沉淀面板 + Release 评测结果块；演示模式同形状 mock 端点"],
          ]}
        />
      </Section>

      <Section
        title="场景优先级复评 · 工单复盘 + 语料/Skills 加强（2026-07-31）"
        description="面向真实使用场景：维护两个阿里云专有云语料库（工单 ack 库 / AI Stack 库），把未能闭环的工单传入平台做复盘与加强。据此对上方通用路线图做一次优先级复评：不建议先修 auth/Prisma，而是沿「复盘有据 → 归因有理 → 加强有验」主线补齐智能核。"
        source="docs/reports/2026-07-31 评估报告 · 第三/五章"
      >
        <Mermaid chart={retroFlowChart} />
        <Table
          head={["阶段", "改进项", "落点", "解决什么问题"]}
          rows={[
            [
              <Pill tone="bad">P0 · 1-2 周</Pill>,
              <strong>工单上下文结构化 + 批量导入</strong>,
              "扩展 Feedback 模型：工单号、产品线、Agent 实际回答、检索命中列表、skill 调用记录；提供批量导入 API/脚本",
              "复盘的证据链 —— 对应行业差距 1（无 Trace）",
            ],
            [
              <Pill tone="bad">P0 · 1-2 周</Pill>,
              <strong>外部语料库检索探针</strong>,
              "给工单 ack 库、AI Stack 库各接一个查询接口（MCP 或 HTTP），拿失败工单的问题去「回放检索」",
              "回答「语料里到底有没有」这个复盘核心问题",
            ],
            [
              <Pill tone="warn">P1 · 2-3 周</Pill>,
              <span><strong>LLM 根因分析（复盘引擎）</strong><br /><span className="text-xs text-zinc-400">第一处该引入 LLM 的地方</span></span>,
              "输入工单上下文 + 回放检索结果，输出五类归因（语料缺失/检索未命中/语料过期/skill 缺失/超出边界）+ 证据 + 建议 targetPartition，人工确认后写回 Feedback",
              "归因不再靠人拍脑袋 —— 对应行业差距 2（Error Analysis）",
            ],
            [
              <Pill tone="warn">P1 · 2-3 周</Pill>,
              <strong>归因聚合看板</strong>,
              "按产品线/归因类别统计，发现共性缺口（如「AI Stack 库在某组件的排障语料系统性缺失」）",
              "从单张工单复盘升级到共性缺口发现",
            ],
            [
              <Pill tone="accent">P2 · 3-4 周</Pill>,
              <strong>加强闭环：复盘产出 → 语料补丁/Skill 建议</strong>,
              "复盘结论直接生成 DRAFT wiki 页 / 外部语料库变更建议单 / skill 加强建议，走现有 Release 审批流",
              "把「加强」从手工劳动变成平台能力 —— 对应行业差距 4（蒸馏引擎）",
            ],
            [
              <Pill tone="accent">P2 · 3-4 周</Pill>,
              <span><strong>失败工单 → 评测集（Golden Set）</strong></span>,
              "每张复盘过的工单沉淀为一条 eval case；发布审批前自动回放评测集，给审批人看「修复 N 张 / 回归 0 张」",
              "发布不再盲批 —— 对应行业差距 3（无回归评测），与 P1 档「外部 Evaluator」理念一致",
            ],
            [
              <Pill tone="neutral">P3 · 按需</Pill>,
              <strong>工程债</strong>,
              "Prisma/Postgres 落地、真实认证与 RBAC 强制、CI/CD、审计入库",
              "单用户阶段可后置；使用规模扩大时自动升回高优（即上方通用路线图的 P0）",
            ],
          ]}
        />
        <Insight label="与通用路线图的关系">
          通用路线图的 P0（鉴权 + Prisma + 审计）是「多人上线」视角；本复评是「单用户价值交付」视角 ——
          先让平台对工单复盘场景产生真实价值，再按使用规模补工程债。两者不冲突，只是排序不同。
        </Insight>
      </Section>

      <Section
        title="总结 · 三条主线"
        description="把整个路线图压缩成三个判断。"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              主线 1 · 工程债 <Pill tone="good">部分完成</Pill>
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--foreground)]">
              <strong>P0 稳定层已完成</strong>：审计日志真正写入、actor 上下文、Zod 全量校验、结构化错误体系、Release diff/semver 修复、反馈状态机、store 加固、<strong>279 个测试（95.9% 覆盖率）</strong>；v1.5 再落地评测闭环（trace 落盘 → 沉淀用例 → 发布前 AI 评测）；v1.6 评测升级确定性断言（未过不调判官）与 FAILED 批准须留痕的软门禁；v1.7 新增 MaaS 真实用量聚合与任务证据链视图（只读，非因果证明）；v1.8 新增 Harness 资产演进线（版本快照结构化对比）与多渠道工单接入（channel 适配器 + 幂等 409）；Prisma 批0 基建与 CI 门禁（lint/test/build 连 PG）已落地。剩余鉴权与运行时切换 PG 待后续工程。
            </p>
          </Card>
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
              主线 2 · Harness 产品化
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--foreground)]">
              <strong>P1 是创意性最高的档</strong>：外部 Evaluator、目标完成校验、灰度 —— 把 OpenAI/Anthropic 的 harness 纪律产品化给业务团队。这是 AgentUp 的真正差异化。
            </p>
          </Card>
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              主线 3 · L3 兑现
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--foreground)]">
              <strong>P2 兑现三层 Loop 的 L3</strong>：Wiki 蒸馏 + L1 采集 + 熵清理。从「改进工具」升级为「自进化系统」，完整闭合 L1↔L2↔L3 数据流。
            </p>
          </Card>
        </div>
        <Insight label="一句话定位">
          AgentUp 的产品价值，本质是 <strong>「把 Harness 工程纪律，产品化给业务团队」</strong> ——
          让非开发者也能像 OpenAI/Anthropic 的 harness 工程师一样，用受控 loop + 外部评估 + 版本化 + 可观测，去持续改进 Agent。
          <span className="text-zinc-500">当前 MVP 已经把「产品形」做对了（四分区 + Release + Version + 三层 Loop 概念），下一步是把「harness 纪律」真正填进去。</span>
        </Insight>
      </Section>
    </div>
  );
}
