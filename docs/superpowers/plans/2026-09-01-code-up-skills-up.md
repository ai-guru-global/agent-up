# code-up / skills-up 双技能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付两个用户级技能——code-up（源码蒸馏为带 file:line 锚点的 Markdown 文档）和 skills-up（Markdown 文档蒸馏为 hub-stub 结构的可调用技能），各自带门禁脚本与单元测试。

**Architecture:** 两个自包含技能目录放 `~/.qoder/skills/`，零代码耦合，通过"Markdown 文档目录"文件契约衔接。每个技能含 SKILL.md + references + templates + scripts（gate.py 门禁执行器 + checks/ 检查项 + lib/ 公共检查库 + tests/）。项目侧只需 YAML 配置文件。

**Tech Stack:** Python 3.14 + PyYAML（门禁脚本）、pytest（单元测试）、mmdc / @mermaid-js/mermaid-cli（mermaid 语法校验）、Markdown + YAML frontmatter（技能与文档格式）。

## Global Constraints

- 所有技能文件内禁止绝对路径（`/Users/`、`/home/`、`C:\`），引用一律相对路径
- SKILL.md frontmatter 只含 `name` + `description` 两字段；description 以 "Use when..." 开头只写触发条件，不总结工作流；frontmatter 总长 ≤1024 字符
- SKILL.md 正文默认 ≤200 行，超出拆 references/
- 门禁脚本只依赖 Python 标准库 + PyYAML，不引入其他第三方包
- 机器可查项全部脚本自动查；LLM 只复查语义项（深度、可读性、蒸馏质量）
- 推测内容必须标注 `> [!NOTE] 推测：...`；浅度分析必须标注浅度
- 每篇蒸馏文档至少一个 mermaid 图且语法可被 mmdc 编译
- 引用格式统一为 `[file.ts:42-50](relative/path#L42-L50)`
- 文档 frontmatter 必含 `title / depth / component_score / generated / source_commit`
- TDD：每个门禁检查项先写失败测试再实现；每个任务结束即提交

---

## 阶段一：code-up 技能

### Task 1: code-up 目录骨架 + ontology.yaml + 三个文档模板

**Files:**
- Create: `~/.qoder/skills/code-up/references/ontology.yaml`
- Create: `~/.qoder/skills/code-up/references/distillation-method.md`
- Create: `~/.qoder/skills/code-up/references/depth-guide.md`
- Create: `~/.qoder/skills/code-up/templates/component.md`
- Create: `~/.qoder/skills/code-up/templates/architecture.md`
- Create: `~/.qoder/skills/code-up/templates/runbook.md`

**Interfaces:**
- Produces: `ontology.yaml` 定义 entities（component/interface/data_flow/troubleshooting_path/decision）和 relations（depends_on/exposes/flows_through/diagnosed_by/justified_by），skills-up 阶段会复制同内容副本

- [ ] **Step 1: 写 ontology.yaml**

```yaml
entities:
  component:
    description: 代码组件（模块/服务/包）
    required_sections: [职责, 设计原理, 依赖, 暴露接口, 排查指南]
  interface:
    description: 对外契约（API/函数签名/事件）
  data_flow:
    description: 数据在组件间的流动
  troubleshooting_path:
    description: 排查路径（症状→定位→修复）
  decision:
    description: 设计决策及动因
relations:
  depends_on:
    from: component
    to: component
  exposes:
    from: component
    to: interface
  flows_through:
    from: data_flow
    to: component  # 可多跳
  diagnosed_by:
    from: troubleshooting_path
    to: component
  justified_by:
    from: decision
    to: component
```

- [ ] **Step 2: 写 distillation-method.md（蒸馏方法论，≤150 行）**

内容要点：读代码的顺序（入口→依赖→叶子）、如何提炼"为什么这么设计"（看 git log 动因、看注释、看测试断言反推意图）、如何提炼"出了问题怎么查"（从报错信息反推排查路径）、file:line 锚点写法、推测标注写法、什么不该写（不复述代码、不罗列函数签名、不写通用编程概念）。

- [ ] **Step 3: 写 depth-guide.md（深度档位指南，≤100 行）**

内容要点：三档定义（core 彻底分析 / standard 常规全流程 / shallow 只出职责+接口+排查入口）、分量评分五维度（代码量、被引用次数、变更频率、入口性、复杂度）、阈值含义、每档对应的文档章节要求。

- [ ] **Step 4: 写三个模板**

`component.md` 骨架：

```markdown
---
title: <组件名>
depth: <core|standard|shallow>
component_score: <0.0-1.0>
generated: <YYYY-MM-DD>
source_commit: <git sha>
---

# <组件名>

> 深度：<core|standard|shallow>（分量分 <分数>）

## 职责
## 设计原理
## 关键决策
## 依赖
## 暴露接口
## 数据流
## 排查指南
## 已知坑
```

`architecture.md` 骨架：frontmatter 同上 + 章节（边界图 mermaid / 数据流 / 模块间契约 / 演进动因）。

`runbook.md` 骨架：frontmatter 同上 + 章节（症状 / 可能原因 / 定位路径带锚点 / 修复方式），每个症状一个 `##` 小节。

- [ ] **Step 5: Commit**

```bash
cd ~/.qoder/skills/code-up
git init 2>/dev/null; git add -A
git commit -m "feat(code-up): add ontology, distillation method, depth guide, and doc templates"
```

---

### Task 2: 公共检查库 scripts/lib/

**Files:**
- Create: `~/.qoder/skills/code-up/scripts/lib/__init__.py`
- Create: `~/.qoder/skills/code-up/scripts/lib/markdown_scan.py`
- Create: `~/.qoder/skills/code-up/scripts/lib/frontmatter.py`
- Create: `~/.qoder/skills/code-up/scripts/lib/links.py`
- Test: `~/.qoder/skills/code-up/scripts/tests/test_lib.py`

**Interfaces:**
- Produces:
  - `markdown_scan.find_absolute_paths(text: str) -> list[tuple[int, str]]` — 返回 (行号, 命中行内容)
  - `markdown_scan.find_placeholders(text: str) -> list[tuple[int, str]]` — 扫描 TBD/TODO/FIXME/XXX/待补充
  - `markdown_scan.find_empty_sections(text: str) -> list[str]` — 返回空章节标题
  - `markdown_scan.find_untyped_code_blocks(text: str) -> list[int]` — 返回裸 ``` 的行号
  - `frontmatter.parse(text: str) -> dict` — 解析 YAML frontmatter，无 frontmatter 返回 {}
  - `frontmatter.check_required(fm: dict, required: list[str]) -> list[str]` — 返回缺失字段
  - `links.extract_relative_links(text: str) -> list[tuple[str, str]]` — 返回 (链接文本, 相对路径)
  - `links.check_links_exist(links: list, base_dir: Path) -> list[str]` — 返回失效相对路径

- [ ] **Step 1: 写失败测试**

```python
# scripts/tests/test_lib.py
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from lib import markdown_scan, frontmatter, links

def test_find_absolute_paths():
    text = "见 /Users/foo/bar.py 和 C:\\Users\\x 以及 /home/y/z.md"
    hits = markdown_scan.find_absolute_paths(text)
    assert len(hits) == 3

def test_find_absolute_paths_ignores_relative():
    text = "见 docs/distilled/a.md 和 ./b.md"
    assert markdown_scan.find_absolute_paths(text) == []

def test_find_placeholders():
    text = "这里 TBD\n这行没问题\nTODO: 补上\n待补充"
    hits = markdown_scan.find_placeholders(text)
    assert len(hits) == 3

def test_find_empty_sections():
    text = "## 有内容\n正文\n## 空章节\n## 也有内容\n正文"
    assert markdown_scan.find_empty_sections(text) == ["## 空章节"]

def test_find_untyped_code_blocks():
    text = "```\n裸块\n```\n```python\n有语言\n```"
    assert markdown_scan.find_untyped_code_blocks(text) == [1]

def test_frontmatter_parse_and_check():
    text = "---\ntitle: x\ndepth: core\n---\n正文"
    fm = frontmatter.parse(text)
    assert fm["title"] == "x"
    assert frontmatter.check_required(fm, ["title", "depth", "missing"]) == ["missing"]

def test_links_check(tmp_path):
    (tmp_path / "a.md").write_text("x")
    text = "[ok](a.md) [bad](b.md)"
    found = links.extract_relative_links(text)
    missing = links.check_links_exist(found, tmp_path)
    assert missing == ["b.md"]
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/.qoder/skills/code-up && python3 -m pytest scripts/tests/test_lib.py -v`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 lib 三个模块**

`markdown_scan.py`：用正则 `(/Users/|/home/|[A-Z]:\\)` 找绝对路径；`(?i)\b(TBD|TODO|FIXME|XXX)\b|待补充` 找占位符；按 `^##` 切分找空章节；找 ` ``` ` 后无语言标识的代码块。

`frontmatter.py`：用 `yaml.safe_load` 解析 `---` 包围的头部。

`links.py`：用正则 `\[([^\]]+)\]\(([^)]+)\)` 抽链接，过滤 `http(s)://` 和 `#` 锚点，剩下当相对路径用 `(base_dir / path).exists()` 校验。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd ~/.qoder/skills/code-up && python3 -m pytest scripts/tests/test_lib.py -v`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
cd ~/.qoder/skills/code-up && git add -A
git commit -m "feat(code-up): add shared check library with tests"
```

---

### Task 3: validate_mermaid.py

**Files:**
- Create: `~/.qoder/skills/code-up/scripts/validate_mermaid.py`
- Test: `~/.qoder/skills/code-up/scripts/tests/test_validate_mermaid.py`

**Interfaces:**
- Produces:
  - `extract_mermaid_blocks(text: str) -> list[tuple[int, str]]` — 返回 (起始行号, mermaid 源码)
  - `validate_block(code: str) -> tuple[bool, str]` — 调 mmdc 编译，返回 (是否通过, 错误信息)
  - CLI：`python3 validate_mermaid.py <md文件或目录>` 输出 JSON 报告

- [ ] **Step 1: 写失败测试**

```python
def test_extract_mermaid_blocks():
    text = "# 标题\n```mermaid\ngraph TD\n  A-->B\n```\n正文\n```python\nx=1\n```"
    blocks = extract_mermaid_blocks(text)
    assert len(blocks) == 1
    assert "graph TD" in blocks[0][1]

def test_validate_block_valid():
    ok, _ = validate_block("graph TD\n  A-->B")
    assert ok

def test_validate_block_invalid():
    ok, err = validate_block("graph TD\n  A-->>")
    assert not ok
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python3 -m pytest scripts/tests/test_validate_mermaid.py -v`
Expected: FAIL

- [ ] **Step 3: 实现**

抽 ` ```mermaid ... ``` ` 块；每个块写临时 `.mmd` 文件，调 `mmdc -i <file> -o /dev/null`（mmdc 不支持输出到 /dev/null 时用临时 .svg 再删），捕获返回码和 stderr。CLI 用 argparse 接收文件或目录，目录时递归找 `.md`。

- [ ] **Step 4: 跑测试确认通过**

Run: `python3 -m pytest scripts/tests/test_validate_mermaid.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(code-up): add mermaid validation script with tests"
```

---

### Task 4: assess_components.py（分量评分）

**Files:**
- Create: `~/.qoder/skills/code-up/scripts/assess_components.py`
- Test: `~/.qoder/skills/code-up/scripts/tests/test_assess_components.py`

**Interfaces:**
- Produces:
  - `score_component(path: Path, repo_root: Path) -> dict` — 返回 `{score: float, dimensions: {loc, refs, churn, entry, complexity}}`
  - `classify(score: float, thresholds: dict) -> str` — 返回 "core" | "standard" | "shallow"
  - CLI：`python3 assess_components.py --repo-root <path> --paths <dir1,dir2> --thresholds-core 0.7 --thresholds-standard 0.3` 输出 JSON

- [ ] **Step 1: 写失败测试**

```python
def test_classify():
    t = {"core": 0.7, "standard": 0.3}
    assert classify(0.8, t) == "core"
    assert classify(0.5, t) == "standard"
    assert classify(0.1, t) == "shallow"

def test_score_dimensions_present(tmp_path):
    # 造一个有两文件的假组件
    comp = tmp_path / "comp"
    comp.mkdir()
    (comp / "index.ts").write_text("export const x = 1\n" * 50)
    (comp / "util.ts").write_text("import { x } from './index'\n")
    result = score_component(comp, tmp_path)
    assert set(result["dimensions"].keys()) == {"loc", "refs", "churn", "entry", "complexity"}
    assert 0.0 <= result["score"] <= 1.0
```

- [ ] **Step 2: 跑测试确认失败**

Expected: FAIL

- [ ] **Step 3: 实现**

五维度各自归一化到 0-1 再加权（默认等权 0.2）：
- `loc`：组件内总行数 / 仓库最大组件行数
- `refs`：grep 仓库内 `from '<组件名>'` 或 `require('<组件名>')` 次数 / 最大引用数
- `churn`：`git log --since=90.days --oneline -- <path>` 行数 / 最大 churn
- `entry`：含 `index.ts|main.py|__init__.py|router|handler` 文件则为 1 否则 0
- `complexity`：平均嵌套深度（粗略按缩进层级）/ 最大复杂度

非 git 仓库时 churn 维度记 0 并在输出标注 `churn_unavailable: true`。

- [ ] **Step 4: 跑测试确认通过**

Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(code-up): add component scoring script with tests"
```

---

### Task 5: verify_citations.py（引用回读验证）

**Files:**
- Create: `~/.qoder/skills/code-up/scripts/verify_citations.py`
- Test: `~/.qoder/skills/code-up/scripts/tests/test_verify_citations.py`

**Interfaces:**
- Produces:
  - `extract_citations(text: str) -> list[dict]` — 返回 `[{file, line_start, line_end, raw}]`
  - `verify_existence(citations: list, repo_root: Path) -> list[dict]` — 机器侧：文件存在 + 行号在范围内，返回失败项 `[{citation, reason}]`
  - `read_cited_lines(citation: dict, repo_root: Path) -> str` — 回读实际行内容，供 LLM 做语义命中判断
  - CLI：`python3 verify_citations.py --doc <md> --repo-root <path> --mode existence` 输出 JSON；`--mode extract-lines` 输出每条引用 + 实际行内容供 LLM 消费

- [ ] **Step 1: 写失败测试**

```python
def test_extract_citations():
    text = "见 [foo.ts:10-20](src/foo.ts#L10-L20) 和 [bar.py:5](lib/bar.py#L5)"
    cits = extract_citations(text)
    assert len(cits) == 2
    assert cits[0] == {"file": "src/foo.ts", "line_start": 10, "line_end": 20, "raw": "[foo.ts:10-20](src/foo.ts#L10-L20)"}
    assert cits[1]["line_start"] == 5 and cits[1]["line_end"] == 5

def test_verify_existence(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "foo.ts").write_text("\n".join(f"line{i}" for i in range(1, 31)))
    cits = [
        {"file": "src/foo.ts", "line_start": 10, "line_end": 20, "raw": "..."},
        {"file": "src/foo.ts", "line_start": 10, "line_end": 99, "raw": "..."},
        {"file": "src/missing.ts", "line_start": 1, "line_end": 1, "raw": "..."},
    ]
    failures = verify_existence(cits, tmp_path)
    assert len(failures) == 2
    assert "越界" in failures[0]["reason"] or "out of range" in failures[0]["reason"]
    assert "不存在" in failures[1]["reason"] or "not found" in failures[1]["reason"]

def test_read_cited_lines(tmp_path):
    (tmp_path / "a.ts").write_text("first\nsecond\nthird")
    content = read_cited_lines({"file": "a.ts", "line_start": 2, "line_end": 3}, tmp_path)
    assert content == "second\nthird"
```

- [ ] **Step 2: 跑测试确认失败**

Expected: FAIL

- [ ] **Step 3: 实现**

用正则 `\[([^\]]+):(\d+)(?:-(\d+))?\]\(([^)#]+)#L(\d+)(?:-L(\d+))?\)` 抽引用。存在性检查：文件存在 + `line_end <= 文件行数`。`read_cited_lines` 按 1-based 行号切片。CLI 的 `--mode extract-lines` 输出 JSON `[{citation, cited_text}]`，供技能主流程喂给 LLM 做语义判断。

- [ ] **Step 4: 跑测试确认通过**

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(code-up): add citation verification script with tests"
```

---

### Task 6: gate.py 门禁执行器 + code-up 的 11 道机器检查

**Files:**
- Create: `~/.qoder/skills/code-up/scripts/gate.py`
- Create: `~/.qoder/skills/code-up/scripts/checks/__init__.py`
- Create: `~/.qoder/skills/code-up/scripts/checks/code_up_checks.py`
- Test: `~/.qoder/skills/code-up/scripts/tests/test_gate.py`

**Interfaces:**
- Consumes: lib（Task 2）、validate_mermaid（Task 3）、verify_citations（Task 5）
- Produces:
  - `run_gate(config_path: Path) -> dict` — 返回 `{passed: bool, errors: [...], warnings: [...]}`
  - CLI：`python3 gate.py --config <code-up.yaml>` 退出码 0=通过 1=有 error

- [ ] **Step 1: 写失败测试**

```python
def test_gate_passes_clean_doc(tmp_path):
    # 造一个合规的 distilled 目录和 code-up.yaml
    ...

def test_gate_fails_on_absolute_path(tmp_path):
    # 文档里塞一个 /Users/ 路径，断言 errors 非空
    ...

def test_gate_fails_on_missing_frontmatter_field(tmp_path):
    ...

def test_gate_warning_does_not_fail_when_fail_on_error(tmp_path):
    # 只触发 warning（如超 800 行），断言 passed=True 且 warnings 非空
    ...
```

- [ ] **Step 2: 跑测试确认失败**

Expected: FAIL

- [ ] **Step 3: 实现 gate.py 骨架**

加载 YAML → 读 `output.dir` → 扫目录下所有 `.md`（排除 `_plan.md`）→ 动态加载 `checks/code_up_checks.py` 里所有 `check_*` 函数 → 每个函数返回 `list[Finding]`（`Finding = {level: error|warning, file, line, message}`）→ 按 `gate.fail_on` 汇总 → 输出 JSON 报告 + 退出码。

- [ ] **Step 4: 实现 11 道机器检查**

`code_up_checks.py` 里 11 个 `check_*` 函数，对应 spec 的 11 道机器项：

1. `check_speculation_marked` — 扫"推测/可能/大概"等词附近无 `> [!NOTE] 推测：` 则报（启发式：发现这些词且全文无推测标注时报 warning，有标注但个别段落疑似漏标报 warning；确定的违规场景是 frontmatter 标了 `has_speculation: true` 但正文无标注 → error）
2. `check_no_absolute_paths` — 调 `lib.markdown_scan.find_absolute_paths`
3. `check_links_valid` — 调 `lib.links`
4. `check_frontmatter` — 调 `lib.frontmatter.check_required`，必填 `title/depth/component_score/generated/source_commit`
5. `check_depth_consistency` — 读 `_plan.yaml`，对照每篇 frontmatter 的 depth；shallow 文档正文首行必须含"浅度分析"
6. `check_length` — 超 800 行报 warning
7. `check_code_block_language` — 调 `lib.markdown_scan.find_untyped_code_blocks`
8. `check_plan_coverage` — `_plan.yaml` 里列的文档都存在，目录里无计划外 `.md`
9. `check_has_mermaid` — 每篇至少一个 ` ```mermaid ` 块
10. `check_mermaid_compiles` — 调 `validate_mermaid.validate_block`
11. `check_citation_format` — 调 `verify_citations.extract_citations`，同时扫裸 `file:line` 未按 `[file:line](path#L...)` 格式写的

- [ ] **Step 5: 跑测试确认通过**

Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(code-up): add gate runner and 11 machine checks with tests"
```

---

### Task 7: code-up SKILL.md

**Files:**
- Create: `~/.qoder/skills/code-up/SKILL.md`
- Create: `~/.qoder/skills/code-up/examples/code-up.yaml.example`

**Interfaces:**
- Consumes: 前面所有任务的脚本与模板
- Produces: 可被 Skill 工具加载的完整技能

- [ ] **Step 1: 写 SKILL.md（≤200 行）**

frontmatter：

```yaml
---
name: code-up
description: Use when 用户要求读透源码并写成文档、蒸馏代码库/模块/组件、生成带 file:line 锚点的架构或组件文档、理解陌生代码库（触发词：code-up、蒸馏源码、读透代码、源码解读、代码蒸馏、生成组件文档）。
---
```

正文结构：
1. 概述（一句话 + 七原则中的 code-up 相关四条）
2. 主流程 7 步（加载配置 → 扫描+分量评分 → 出计划 → 硬门禁 → 蒸馏 → 引用回读验证 → 门禁+交付），每步一行，细节指向 references/
3. 何时读 references/distillation-method.md（写文档时）
4. 何时读 references/depth-guide.md（出计划定深度时）
5. 脚本调用约定：每个脚本给出确切命令行（相对技能目录），注明"脚本路径以技能安装目录为基准，运行时先 `cd` 到技能目录或用脚本绝对路径——但写入文档的内容禁止绝对路径"
6. 红旗清单：想跳过引用回读直接交付 → 停；想凭记忆写结论不读代码 → 停；想在文档里写绝对路径 → 停；想不写计划直接开写 → 停
7. gotcha 双写约定：执行结束后追加项目 `gotchas.md` 和技能 `known-issues.md`

- [ ] **Step 2: 写 examples/code-up.yaml.example**

完整注释版配置，含所有字段的默认值和说明。

- [ ] **Step 3: 自检 SKILL.md**

确认：frontmatter 只有 name+description；description 无工作流总结；正文 ≤200 行；无绝对路径；脚本引用都带相对路径。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(code-up): add SKILL.md and example config"
```

---

### Task 8: code-up 首次真实验收

**Files:**
- Create: `<某个真实小项目>/code-up.yaml`（建议用 agent-up 的 `apps/web/lib/services/` 单模块）

**Interfaces:**
- Consumes: 完整 code-up 技能
- Produces: 真实蒸馏文档 + 验收结论（通过/打回 + 原因）

- [ ] **Step 1: 在目标项目写 code-up.yaml**（source.paths 指向单模块，depth.mode: auto）

- [ ] **Step 2: 走完整 7 步流程**，硬门禁处请用户批准计划

- [ ] **Step 3: 记录验收结果**：门禁是否全过、引用回读发现多少漂移/不实、文档是否真的是蒸馏而非复述

- [ ] **Step 4: 把验收发现的坑写入 gotchas.md（项目）和 known-issues.md（技能）**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test(code-up): first real-world acceptance on <项目名>"
```

---

## 阶段二：skills-up 技能

### Task 9: skills-up 目录骨架 + ontology 副本 + 三个模板

**Files:**
- Create: `~/.qoder/skills/skills-up/references/ontology.yaml`（与 code-up 内容相同）
- Create: `~/.qoder/skills/skills-up/references/skill-authoring.md`
- Create: `~/.qoder/skills/skills-up/references/hub-stub-guide.md`
- Create: `~/.qoder/skills/skills-up/templates/skill-hub.md`
- Create: `~/.qoder/skills/skills-up/templates/stub.md`
- Create: `~/.qoder/skills/skills-up/templates/troubleshooting.md`

**Interfaces:**
- Produces: hub-stub 模板约定，Task 11 的门禁会校验生成技能是否符合该结构

- [ ] **Step 1: 复制 ontology.yaml**（内容同 code-up，逐字节一致）

- [ ] **Step 2: 写 skill-authoring.md（≤150 行）**

内容要点：SKILL.md frontmatter 规范（name+description、description 只写触发条件不总结流程、≤1024 字符）、触发词设计（具体症状/场景，避免"各种""相关"）、hub 只放路由和主流程、stub 引用必须带加载时机、红旗清单写法、与现有技能触发词去重。

- [ ] **Step 3: 写 hub-stub-guide.md（≤100 行）**

内容要点：hub-stub 结构定义、何时拆 stub（超 200 行 / 某主题可独立加载）、stub 命名（kebab-case）、troubleshooting stub 固定四要素（问题现象/关键信息和关键报错/排查建议/解决建议）、源文档缺要素时标"（源文档未覆盖）"不得编造。

- [ ] **Step 4: 写三个模板**

`skill-hub.md` 骨架：frontmatter（name/description 占位说明）+ 章节（概述/主流程 mermaid 图/各 stub 加载时机/红旗清单）。

`stub.md` 骨架：frontmatter（title/source/source_commit）+ 正文。

`troubleshooting.md` 骨架：每个问题一个 `##` 小节，固定四个 `###` 子节。

- [ ] **Step 5: Commit**

```bash
cd ~/.qoder/skills/skills-up && git init 2>/dev/null; git add -A
git commit -m "feat(skills-up): add ontology copy, authoring guides, and hub-stub templates"
```

---

### Task 10: 复制公共脚本 + lib

**Files:**
- Create: `~/.qoder/skills/skills-up/scripts/lib/`（从 code-up 逐文件复制）
- Create: `~/.qoder/skills/skills-up/scripts/validate_mermaid.py`（从 code-up 复制）
- Test: `~/.qoder/skills/skills-up/scripts/tests/test_lib.py`（从 code-up 复制）

**Interfaces:**
- Consumes: code-up Task 2、Task 3 的产出
- Produces: skills-up 自包含的公共检查能力

- [ ] **Step 1: 复制文件**

```bash
cp -r ~/.qoder/skills/code-up/scripts/lib ~/.qoder/skills/skills-up/scripts/lib
cp ~/.qoder/skills/code-up/scripts/validate_mermaid.py ~/.qoder/skills/skills-up/scripts/
mkdir -p ~/.qoder/skills/skills-up/scripts/tests
cp ~/.qoder/skills/code-up/scripts/tests/test_lib.py ~/.qoder/skills/skills-up/scripts/tests/
cp ~/.qoder/skills/code-up/scripts/tests/test_validate_mermaid.py ~/.qoder/skills/skills-up/scripts/tests/
```

- [ ] **Step 2: 跑测试确认通过**

Run: `cd ~/.qoder/skills/skills-up && python3 -m pytest scripts/tests/ -v`
Expected: 全部通过（10 个测试）

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(skills-up): vendor shared lib and mermaid validator from code-up"
```

---

### Task 11: skills-up gate.py + 20 道机器检查

**Files:**
- Create: `~/.qoder/skills/skills-up/scripts/gate.py`
- Create: `~/.qoder/skills/skills-up/scripts/checks/__init__.py`
- Create: `~/.qoder/skills/skills-up/scripts/checks/skills_up_checks.py`
- Test: `~/.qoder/skills/skills-up/scripts/tests/test_gate.py`

**Interfaces:**
- Consumes: lib、validate_mermaid（Task 10）
- Produces: `run_gate(config_path: Path) -> dict` + CLI 同 code-up gate.py 约定

- [ ] **Step 1: 写失败测试**

```python
def test_gate_passes_valid_skill(tmp_path):
    # 造一个合规技能目录（SKILL.md + references/ + 合法 frontmatter + mermaid 图）
    ...

def test_gate_fails_on_missing_description(tmp_path):
    ...

def test_gate_fails_on_vague_trigger_words(tmp_path):
    # description 含"各种"，断言 error
    ...

def test_gate_fails_on_stub_without_loading_timing(tmp_path):
    # SKILL.md 引用 references/x.md 但无"当...时读"字样，断言 error
    ...

def test_gate_fails_on_unmarked_speculation_passthrough(tmp_path):
    # 源文档有"推测"标注，生成的 stub 洗掉了，断言 error
    ...
```

- [ ] **Step 2: 跑测试确认失败**

Expected: FAIL

- [ ] **Step 3: 实现 gate.py 骨架**（与 code-up 同构：加载 YAML → 扫 `output.dir` 下技能目录 → 动态加载 checks → 汇总 → JSON 报告 + 退出码）

- [ ] **Step 4: 实现 20 道机器检查**

对应 spec 的 A/B/C/D 四组：

A 结构合规（6）：`check_skill_md_exists`、`check_name_kebab_matches_dir`、`check_description_has_triggers`（扫"各种/相关/等"模糊词）、`check_skill_md_length`、`check_stub_split_with_timing`（超限且 stub 引用无加载时机 → error）、`check_no_absolute_paths`

B 可追溯（5）：`check_referenced_files_exist`、`check_stub_has_source`、`check_source_in_doc_paths`、`check_source_commit_inherited`（warning）、`check_no_external_refs`

C 内容质量（6）：`check_no_placeholders`、`check_no_empty_sections`、`check_code_block_language`（warning）、`check_internal_links`、`check_frontmatter_valid`、`check_mermaid_present_and_compiles`

D 诚实边界（3）：`check_speculation_preserved`（源文档有 `> [!NOTE] 推测：` 的内容在 stub 中仍有标注——按 source 字段回溯源文档对比）、`check_shallow_preserved`、`check_skipped_docs_have_reasons`（读 `_plan.md`）

- [ ] **Step 5: 跑测试确认通过**

Expected: 5 passed

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(skills-up): add gate runner and 20 machine checks with tests"
```

---

### Task 12: skills-up SKILL.md

**Files:**
- Create: `~/.qoder/skills/skills-up/SKILL.md`
- Create: `~/.qoder/skills/skills-up/examples/skills-up.yaml.example`

- [ ] **Step 1: 写 SKILL.md（≤200 行）**

frontmatter：

```yaml
---
name: skills-up
description: Use when 用户要求把 Markdown 文档蒸馏成可调用的技能、基于文档目录生成 SKILL.md、把知识库/蒸馏文档变成 agent 技能（触发词：skills-up、蒸馏技能、生成技能、文档变技能、skill 生成）。
---
```

正文结构同 code-up：概述 / 主流程 7 步 / 何时读 references/skill-authoring.md / 何时读 references/hub-stub-guide.md / 脚本调用约定 / 红旗清单（想把源文档整段复制进 SKILL.md → 停；想编造源文档没有的排查步骤 → 停；想洗掉推测标注 → 停；想跳过计划直接生成 → 停）/ gotcha 双写约定。

- [ ] **Step 2: 写 examples/skills-up.yaml.example**

- [ ] **Step 3: 自检**（同 code-up Task 7 Step 3）

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(skills-up): add SKILL.md and example config"
```

---

### Task 13: 端到端验收

**Files:**
- Create: `<项目>/skills-up.yaml`（source.doc_paths 指向 Task 8 的真实产出 docs/distilled/）

**Interfaces:**
- Consumes: 完整 skills-up 技能 + Task 8 的真实蒸馏文档
- Produces: 可加载的新技能 + 端到端验收结论

- [ ] **Step 1: 写 skills-up.yaml 并走完整 7 步流程**，硬门禁处请用户批准计划

- [ ] **Step 2: 把生成的技能拷到 `~/.qoder/skills/<new-skill>/`**

- [ ] **Step 3: 开新会话实际调用该技能**，验证 Agent 能否不看源码完成任务（spec 第 29 道门禁的真实版）

- [ ] **Step 4: 记录验收结果 + gotcha 双写**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test(skills-up): end-to-end acceptance with real distilled docs"
```

---

## Self-Review 记录

- Spec 覆盖：七原则 → 融入各任务约束与 SKILL.md 红旗清单；整体架构 → Task 1/9/10；本体论 → Task 1/9；code-up 7 步流程 → Task 7 SKILL.md；分量评分 → Task 4；引用回读 → Task 5；code-up 16 道门禁 → Task 6（11 机器）+ SKILL.md 红旗与 references（5 人工由执行时 LLM 复查）；skills-up hub-stub → Task 9/12；skills-up 29 道门禁 → Task 11（20 机器）+ SKILL.md（9 人工）；协作流/错误处理/gotcha 双写 → 两 SKILL.md；测试策略三层 → 各任务单元测试 + Task 8/13 验收。
- 占位符扫描：Task 6 Step 1 和 Task 11 Step 1 的测试函数体用了 `...` 省略 fixture 构造细节——这是有意为之，fixture 构造依赖实现时的具体目录结构，执行者按测试名意图补全即可；其余步骤均含完整代码或确切命令。
- 类型一致性：`extract_citations` 返回 dict 含 `file/line_start/line_end/raw`，Task 5 测试与 Task 6 的 `check_citation_format` 消费一致；`Finding` 结构在两个 gate.py 间一致。
