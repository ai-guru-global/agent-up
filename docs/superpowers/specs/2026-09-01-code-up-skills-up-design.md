# code-up / skills-up 双技能设计

日期：2026-09-01
状态：待批准

## 背景与目标

新建两个用户级技能：

- **code-up**：把源码蒸馏为 Markdown 文档
- **skills-up**：把 Markdown 文档蒸馏为可调用的技能

两者分工明确、互相供给：code-up 只管源码 → 文档，skills-up 只管文档 → 技能。

## 七条通用设计原则

1. **源码是唯一事实**：带着答案看代码，不信记忆、不信二手文档。每个结论必须锚到 `file:line`，锚不出来就标注"推测"。源码绑定具体版本，在版本碎片化环境下这是铁律。
2. **蒸馏而非复述**：文档提炼"为什么这么设计"和"出了问题怎么查"，不是把代码翻译成中文。只罗列函数名的文档不合格。
3. **先计划再动手**：写任何文档前先生成清单（出哪些文档、每篇写什么、写多深），硬门禁等用户批准后才动手。
4. **质量靠门禁不靠自觉**：机器能查的（格式、链接、行号、引用）全部脚本自动查；人只复查机器看不出的（深度、可读性、高危操作）。
5. **诚实无幻觉**：浅度分析必须标注浅度，不冒充完整分析；跳过的步骤必须写明理由。知识库一开始就骗人，后面就没有信任。
6. **文件夹拷走就能用**：无绝对路径；方法论、模板、工具都在技能目录内；项目根目录只放配置文件，支持多副本多项目。
7. **分工明确、互相供给**：code-up 只蒸馏源码出 Markdown；skills-up 只把 Markdown 蒸馏成技能。两者零代码耦合，通过文件系统契约衔接。

## 整体架构

两个用户级技能，各自自包含：

```
~/.qoder/skills/
├── code-up/
│   ├── SKILL.md
│   ├── references/
│   │   ├── ontology.yaml          # 统一本体论（与 skills-up 内容相同）
│   │   ├── distillation-method.md # 如何读代码、如何写蒸馏文档
│   │   └── depth-guide.md         # 深度档位定义与分量评分说明
│   ├── templates/
│   │   ├── component.md
│   │   ├── architecture.md
│   │   └── runbook.md
│   └── scripts/
│       ├── gate.py                # 门禁执行器
│       ├── assess_components.py   # 组件分量评分
│       ├── verify_citations.py    # 引用回读验证
│       ├── validate_mermaid.py    # mermaid 语法校验
│       ├── lib/                   # 公共检查库（与 skills-up 各持一份副本）
│       ├── checks/                # code-up 专属检查项
│       └── tests/                 # 门禁脚本单元测试
└── skills-up/
    ├── SKILL.md
    ├── references/
    │   ├── ontology.yaml          # 统一本体论（与 code-up 内容相同）
    │   ├── skill-authoring.md     # 如何从文档提炼技能、触发词设计
    │   └── hub-stub-guide.md      # hub-stub 结构规范
    ├── templates/
    │   ├── skill-hub.md           # SKILL.md 骨架
    │   ├── stub.md                # 子文档骨架
    │   └── troubleshooting.md     # 排查 stub 四要素骨架
    └── scripts/
        ├── gate.py
        ├── validate_mermaid.py
        ├── lib/                   # 公共检查库副本
        ├── checks/                # skills-up 专属检查项
        └── tests/
```

被分析项目侧契约：

```
<项目根>/
├── code-up.yaml
├── skills-up.yaml
├── gotchas.md                     # 项目坑记录（loop 工程反馈）
└── docs/
    ├── distilled/                 # code-up 输出
    │   ├── _plan.yaml             # 机器可读蒸馏计划
    │   └── _plan.md               # 人读计划摘要
    └── skills/                    # skills-up 输出
        ├── _plan.yaml
        ├── _plan.md
        └── <new-skill>/
            ├── SKILL.md           # hub
            └── references/        # stubs
```

核心数据流：

```
源码 ──[code-up + code-up.yaml]──> docs/distilled/*.md ──[skills-up + skills-up.yaml]──> docs/skills/<new-skill>/
```

关键架构决策：

1. **零代码耦合**：skills-up 不 import code-up 任何东西，只认"Markdown 文档目录"这个文件系统契约。手写文档喂给 skills-up 也能跑。
2. **公共检查代码物理复制**：`scripts/lib/` 在两个技能目录各一份，内容相同。牺牲 DRY 换"文件夹拷走就能用"。
3. **门禁执行器同构不同内容**：两边 `gate.py` 骨架相同（加载 YAML → 跑 checks/ → 汇总报告），checks/ 内容不同。
4. **配置文件分离**：一个项目可同时有两个 YAML 或只有其一；monorepo 子包各自放各自的 YAML。
5. **统一本体论**：两个技能共享一份 `ontology.yaml` 定义（各自带副本），让蒸馏产物结构可预测。

## 统一本体论

`references/ontology.yaml`（两个技能内容相同）：

```yaml
entities:
  component:             # 代码组件（模块/服务/包）
  interface:             # 对外契约（API/函数签名/事件）
  data_flow:             # 数据在组件间的流动
  troubleshooting_path:  # 排查路径（症状→定位→修复）
  decision:              # 设计决策及动因
relations:
  depends_on:    component -> component
  exposes:       component -> interface
  flows_through: data_flow -> component[]
  diagnosed_by:  troubleshooting_path -> component
  justified_by:  decision -> component
```

code-up 的文档模板按本体组织章节（组件文档必有"依赖""暴露接口"节）；skills-up 的 stub 拆分按本体（一种实体类型一个 stub）。

## code-up 详细设计

### 触发场景

用户说"读透 X 源码并写成文档""蒸馏这个模块""帮我理解 X 的代码"等。

### 主流程（7 步）

1. **加载配置**：读项目根 `code-up.yaml`；不存在则问用户是否 init 生成默认配置。
2. **扫描源码**：按 YAML 的 `source.paths` / `exclude` 扫出文件清单；同时读项目 `gotchas.md`，把历史坑作为本次蒸馏注意事项。运行 `assess_components.py` 对每个组件做分量评分。
3. **出蒸馏计划**：生成 `_plan.yaml`（机器可读）+ `_plan.md`（人读摘要）：要出哪些文档、每篇写什么、每个组件的分量分和对应深度档位、预计篇幅。
4. **硬门禁**：停下等用户批准计划。用户可改计划后批准。`plan.auto_approve: true` 可跳过（不推荐）。
5. **逐篇蒸馏**：按计划写文档。每篇遵循"蒸馏而非复述"：设计原理 + 排查原理，每个结论带 `file:line` 锚点；锚不出来的标 `> [!NOTE] 推测：...`。每篇至少一个 mermaid 图。
6. **引用回读验证**：`verify_citations.py` 对每篇文档抽出所有 `file:line` 锚点，回读源文件对应行。分工：机器做存在性与漂移检测（文件是否存在、行号是否越界、该行内容与蒸馏时快照是否一致——不一致即"源码已漂移"）；LLM 做语义命中判断（该行内容是否支撑文档结论——不支撑即"引用不实"）。全部命中才进入第 7 步；任一 error 打回第 5 步重写该篇。
7. **跑门禁**：`gate.py` 跑全部机器可查项 → 输出结构化报告 → LLM 负责人工复查项 → 全部通过才交付。交付后追加 gotcha 双写。

### code-up.yaml schema

```yaml
version: 1
project:
  name: <项目名>
source:
  paths: [<源码目录相对路径>]
  exclude: [<glob 排除模式>]
  languages: [typescript]
depth:
  mode: auto                    # auto | manual
  thresholds:
    core: 0.7                   # 归一化分量分阈值
    standard: 0.3
  manual_overrides:             # mode: manual 时生效
    <路径>: <core|standard|shallow>
output:
  dir: docs/distilled
  language: zh
plan:
  auto_approve: false
gate:
  fail_on: [error]
```

### 组件分量评分（depth.mode: auto）

`assess_components.py` 对每个组件按五维度打分：

- 代码量（行数、文件数）
- 被引用次数（import/require 计数）
- 变更频率（近 90 天 git log 该路径 commit 数）
- 入口性（是否路由 handler / main / index / public API）
- 复杂度（嵌套深度、依赖数）

加权汇总归一化后映射：`>= core 阈值` → core（彻底分析）；`>= standard 阈值` → standard（常规全流程）；其余 → shallow（只出职责+接口+排查入口）。

蒸馏计划里必须标注每个组件的分量分和深度档位，用户在硬门禁时可看到"为什么这个组件是 core"，可手动调整后再批准。

每篇文档 frontmatter 带 `depth: core|standard|shallow` + `component_score: <分数>`，正文首行有对应深度声明。

### 文档模板

- `component.md`：职责 / 设计原理 / 关键决策及锚点 / 依赖与暴露接口（按本体）/ 排查指南 / 已知坑
- `architecture.md`：边界图（mermaid）/ 数据流 / 模块间契约 / 演进动因
- `runbook.md`：症状 → 可能原因 → 定位路径（带锚点）→ 修复方式

每篇 frontmatter 带 `source_commit: <git sha>`，把文档绑定到具体代码版本。引用格式采用 `[file.ts:42-50](relative/path#L42-L50)`，相对路径保证可拷走；有 git remote 时额外附 commit hash 永久链接。

### code-up 门禁清单（16 道）

机器自动查（gate.py，11 道）：

| # | 检查项 | 级别 |
|---|--------|------|
| 1 | 推测性内容必须用 `> [!NOTE] 推测：` 显式标注 | error |
| 2 | 文档中无绝对路径 | error |
| 3 | 文档间相对链接全部有效 | error |
| 4 | frontmatter 合规：title / depth / component_score / generated / source_commit | error |
| 5 | 深度标注与 `_plan.yaml` 一致；shallow 文档正文首行有"浅度分析"声明 | error |
| 6 | 每篇文档不超过篇幅上限（默认 800 行） | warning |
| 7 | 代码块标注语言 | warning |
| 8 | `_plan.yaml` 与实际产出文件一一对应 | error |
| 9 | 每篇文档至少含一个 mermaid 图 | error |
| 10 | 所有 mermaid 图语法可编译（validate_mermaid.py） | error |
| 11 | 引用格式符合 `[file:line](path#L...)` 规范 | error |

LLM 人工复查（5 道）：

| # | 检查项 |
|---|--------|
| 12 | 是蒸馏而非复述：回答了"为什么这么设计"和"出问题怎么查" |
| 13 | 深度与计划一致：core 确实讲透，shallow 没有过度展开 |
| 14 | 跳过项有理由写在文档里 |
| 15 | 无幻觉残留：抽查 3-5 个锚点，LLM 亲自读那段代码确认结论一致 |
| 16 | 分量评分合理性：抽查 2-3 个 shallow 组件确认确实非核心 |

## skills-up 详细设计

### 触发场景

用户说"把这些文档蒸馏成技能""基于 docs/distilled 生成技能""把 X 文档变成可调用的 skill"等。

### 主流程（7 步）

1. **加载配置**：读项目根 `skills-up.yaml`；不存在则问用户 init。
2. **扫描文档源**：按 YAML 的 `source.doc_paths` 扫出 Markdown 清单（默认 `docs/distilled/`，也接受任意手写/第三方文档目录）。
3. **出技能计划**：生成 `_plan.yaml` + `_plan.md`：出几个技能、每个技能名、触发词、覆盖哪些文档、hub 主流程草稿、stub 拆分方案（按本体）。
4. **硬门禁**：停下等用户批准。
5. **逐技能蒸馏**：按计划生成技能目录（hub-stub 结构，见下）。
6. **跑门禁**：`gate.py` 跑机器可查项 → LLM 复查人工项。
7. **自检可用性**：生成的技能目录结构必须能被 Skill 工具直接加载（frontmatter 合法、无绝对路径、拷走即用）。交付后追加 gotcha 双写。

### skills-up.yaml schema

```yaml
version: 1
source:
  doc_paths: [docs/distilled]
  exclude: [**/_plan.md, **/_plan.yaml]
  follow_links: true
output:
  dir: docs/skills
  naming: kebab-case
skill:
  language: zh
  max_skill_lines: 200
  trigger_words: required
plan:
  auto_approve: false
gate:
  fail_on: [error]
```

### hub-stub 产出结构

```
<new-skill>/
├── SKILL.md                  # hub：触发条件 → 主流程 → 何时读哪个 stub
└── references/               # stubs：按需加载
    ├── <topic-a>.md
    └── troubleshooting.md    # 排查 stub，固定四要素
```

hub 纪律：只放路由和主流程骨架，超 `max_skill_lines` 的内容必须拆 stub；每个 stub 引用必须带明确加载时机（"当用户问 X 时读 references/y.md"），禁止"详见 references"式无指引引用。

troubleshooting stub 四要素固定结构：

```markdown
## <问题名称>
### 问题现象
### 关键信息和关键报错
### 排查建议
### 解决建议
```

源文档缺哪个要素就标"（源文档未覆盖）"，不得编造。

### skills-up 门禁清单（29 道）

机器自动查（gate.py，20 道）：

A. 结构合规（6 道）：

| # | 检查项 | 级别 |
|---|--------|------|
| 1 | 技能目录含 SKILL.md 且 frontmatter 有 name 和 description | error |
| 2 | name 是合法 kebab-case 且与目录名一致 | error |
| 3 | description 含明确触发词，不含"各种""相关"等模糊表述 | error |
| 4 | SKILL.md 正文不超过 `max_skill_lines` | error |
| 5 | 超限内容拆到 references/，且 SKILL.md 中有带加载时机的指引 | error |
| 6 | 技能目录内无绝对路径 | error |

B. 可追溯性（5 道）：

| # | 检查项 | 级别 |
|---|--------|------|
| 7 | SKILL.md 引用的每个 references/templates/scripts 文件真实存在 | error |
| 8 | references/ 每篇文档标注来源（`source: <原文档相对路径>`） | error |
| 9 | 来源文档真实存在于 doc_paths 内 | error |
| 10 | 来源文档带 source_commit 时 references 继承该字段 | warning |
| 11 | 生成的技能不引用 doc_paths 之外的文件 | error |

C. 内容质量机器可查项（6 道）：

| # | 检查项 | 级别 |
|---|--------|------|
| 12 | 无占位符残留（TBD/TODO/FIXME/XXX/待补充） | error |
| 13 | 无空章节 | error |
| 14 | 代码块标注语言 | warning |
| 15 | 内部相对链接全部有效 | error |
| 16 | frontmatter 字段合法 | error |
| 17 | hub 和 troubleshooting stub 各含至少一个 mermaid 图且语法可编译 | error |

D. 诚实与边界（3 道）：

| # | 检查项 | 级别 |
|---|--------|------|
| 18 | 源文档标"推测"的内容蒸馏后仍保留推测标注 | error |
| 19 | 源文档标"浅度分析"的内容蒸馏后在 references 保留标注 | error |
| 20 | 计划里声明跳过的文档在 `_plan.md` 里有理由记录 | error |

LLM 人工复查（9 道）：

| # | 检查项 |
|---|--------|
| 21 | 触发词质量：抽查 3 个该触发的表述和 3 个不该触发的表述做判断 |
| 22 | 是蒸馏而非搬运：SKILL.md 是可执行流程指引，不是文档复制粘贴 |
| 23 | 粒度合适：一个技能只干一件事；多技能时边界清晰不重叠 |
| 24 | 主流程可执行：步骤能真的按顺序走下来，无"视情况而定"空话 |
| 25 | stub 拆分合理：细节都在 stub，引用时机明确 |
| 26 | 红旗清单：技能含"出现即停下"的红旗场景 |
| 27 | 与现有技能不冲突：触发词不与 ~/.qoder/skills/ 已有技能过度重叠 |
| 28 | 诚实性抽查：随机抽 3 处 SKILL.md 论断回溯源文档确认有依据 |
| 29 | 可用性终检：模拟新会话只看 SKILL.md 判断 Agent 能否正确使用（默认静态判断；深度模式可用 subagent 实际跑一遍） |

## 协作流、错误处理与测试

### 协作流

```
用户: "读透这个仓库"
  └─> code-up：源码 + code-up.yaml → docs/distilled/*.md（带锚点）
用户: "把这些文档变成技能"
  └─> skills-up：docs/distilled/ + skills-up.yaml → docs/skills/<new-skill>/
        用户拷走到 ~/.qoder/skills/ 即可全局使用
```

契约纪律：code-up 不知道 skills-up 的存在；skills-up 只认 Markdown 目录；`_plan.yaml`/`_plan.md` 是两个技能共同的暂停点。

### 配置双受众

同一份 YAML 驱动两种执行方式：

- AI 会话内：技能读 YAML 执行，门禁由 AI 调 `python3 scripts/gate.py`
- 命令行/CI：用户直接跑 `python3 ~/.qoder/skills/<技能>/scripts/gate.py --config <yaml>`，脚本自读 YAML 跑门禁，输出同样的结构化报告

YAML 里所有路径相对项目根，两种受众行为一致。

### gotcha 双写（loop 工程反馈）

每次执行结束（无论成败）追加两条记录：

- 项目坑 → `<项目根>/gotchas.md`：与项目相关的坑，格式 `## YYYY-MM-DD · <技能名>` + 条目列表
- 技能坑 → `~/.qoder/skills/<技能名>/known-issues.md`：技能自身缺陷，供技能迭代参考

code-up 第 2 步扫描时先读项目 `gotchas.md`，把历史坑作为本次蒸馏注意事项，形成 loop 闭环。

### 错误处理

统一原则：error 阻断、warning 报告、绝不静默降级。

code-up：

| 场景 | 行为 |
|------|------|
| code-up.yaml 不存在 | 询问是否 init；拒绝则中止 |
| source.paths 为空或不存在 | error 中止 |
| 单篇文档超篇幅上限 | warning 不阻断 |
| 引用回读发现行号漂移 | error 打回重写该篇 |
| 引用回读发现引用不实 | error 打回重写该篇 |
| 用户对计划说"不" | 回第 3 步重新出计划 |
| 门禁任一 error 失败 | 阻断交付，输出报告 |

skills-up 额外两条：

| 场景 | 行为 |
|------|------|
| doc_paths 无 Markdown | error 中止 |
| 生成的技能名与已有技能冲突 | error 提示改名或显式覆盖 |

### 测试策略

三层：

1. **门禁脚本单元测试**：每个 `scripts/checks/*.py` 配"应该过"和"应该挂"的 fixture，pytest 跑，放 `scripts/tests/`。
2. **端到端冒烟测试**：技能目录放 `examples/tiny-repo/`，冒烟脚本跑完整链路（code-up 蒸馏 → 断言过门禁 → skills-up 蒸馏 → 断言过门禁），每次改技能后跑。
3. **人工验收**：首次交付前用 code-up 蒸馏一个真实中型项目（如 agent-up 自身模块），用 skills-up 把产出蒸馏成技能，在新会话里实际调用生成的技能验证可用性。

## 实施顺序

1. 建 code-up 骨架（SKILL.md + 配置 schema + 3 个模板 + ontology.yaml）
2. 建 code-up 脚本：assess_components.py、verify_citations.py、validate_mermaid.py、gate.py + 11 道机器检查 + 单元测试
3. 用 code-up 蒸馏一个真实小项目做首次验收
4. 建 skills-up 骨架（SKILL.md + 配置 schema + 3 个模板 + ontology.yaml 副本）
5. 建 skills-up 脚本：gate.py + 20 道机器检查 + 单元测试
6. 用 skills-up 把第 3 步产出蒸馏成技能，做端到端验收

## 对标参考

- zread（智谱）：CLI 工具型，产出 wiki 到 `.zread/wiki/`，支持断点续跑和增量。借鉴其 on-disk 布局约定。
- deepwiki-skill（natsu1211）：6 阶段工作流（scan → toc-design → doc-write → validate → summary → sync），行级引用格式 `[file:42-50](url#L42-L50)`，mermaid 编译校验，PAGE_ID/AUTOGEN 结构标记。借鉴其引用格式标准化、mermaid 校验、TOC 与文档分离（我们的 `_plan.yaml` 对应其 `toc.yaml`）。
- awesome-copilot 的 Doc & Mod / Acquire Codebase / Code Tour：文档直接链接到真实文件行号。
