# code-up 首次真实验收 gotchas（agent-up 仓库）

> 来源：Task 8b 首次真实验收（source_commit `7524808330e38b5510c65b690348f59c127559c2`，2026-09-03）。
> 范围：本仓库上执行 code-up 蒸馏时验证与评分工具链的坑。所有机制均已对照技能脚本源码核实，非猜测。
> 注意：本文件位于 docs/distilled/ 之外，不受门禁扫描；若移入门禁目录，文中字面反例会触发检查。

---

## 1. 引用 destination 含圆括号时被静默跳过（最高优先级）

**现象**：Next.js 路由组等含圆括号路径写成标准引用后，两个解析器都在 `)` 处截断。verify_citations.py 的 `CITATION_RE` destination 段是 `[^)#]+`，遇 `(dashboard)` 的 `)` 即断，整条引用正则不匹配；lib/links.py 的 `_LINK_RE` 是 `\(([^)]+)\)`，同样截断，gate 报"链接目标不存在： apps/web/app/(dashboard"。更隐蔽的是：解析失败的引用被 verify_citations **静默跳过**——不进 total_citations、不进 failures，existence 模式 failure_count=0 制造虚假安全感。

反例（门禁无法表达、且会被静默丢弃）：

```
[page.tsx:269](apps/web/app/(dashboard)/wiki/page.tsx#L269)
```

**影响**：引用全部丢失且零报错；existence 全绿 ≠ 引用无恙；门禁对这类路径形同虚设，仅靠脚本输出无法发现问题。

**绕法**：两条，缺一不可。

① 此类路径不用标准引用，改反引号路径＋全角括号行号内联标注，并附一句说明：

```markdown
`app/(dashboard)/wiki/page.tsx`（L269、L275），路径含路由组括号无法写成标准引用
```

② 验证后必须跑对账脚本，比对文档中引用形文本数与 `CITATION_RE` 解析数，mismatch 即存在被静默跳过的引用：

```bash
python3 - <<'EOF'
import re
from pathlib import Path
CIT = re.compile(r"\[([^\]]+):(\d+)(?:-(\d+))?\]\(([^)#]+)#L(\d+)(?:-(\d+))?\)")
SHAPE = re.compile(r"\[[^\]\n]+:\d+(?:-\d+)?\]\([^)#\n]*#L\d+")
for p in sorted(Path("docs/distilled").glob("*.md")):
    if p.name.startswith("_"):
        continue
    t = p.read_text()
    parsed, shaped = len(CIT.findall(t)), len(SHAPE.findall(t))
    if parsed != shaped:
        print(f"mismatch: {p} parsed={parsed} shaped={shaped}")
print("reconciliation done")
EOF
```

## 2. 裸引用检查对未解析引用的二次命中

**现象**：code_up_checks.py 的 `_BARE_CITATION_RE = re.compile(r"[A-Za-z0-9_./\-]+\.[A-Za-z]{1,6}:\d+")` 逐行工作：先把该行所有**已解析**引用的 raw 移除，再搜剩余文本。当引用因圆括号等未解析时 raw 不会被移除，label 里的 `page.tsx:462` 被命中，报"存在未按 [file:line](path#L...) 格式书写的引用"。

**影响**：一个坏引用产生两类错误（"链接目标不存在"＋"未按格式书写"），误导排障方向。

**绕法**：两类错误指向同一行时，优先怀疑路径含 `(`/`)`（见坑 1），修根因后两类错误同时消失。

## 3. 解释性文字里的字面引用示例被当真链接

**现象**：为解释引用格式在正文中写字面示例（如 `[file:line](path#L…)`），即使包进反引号，仍被 `_LINK_RE` 当作真实链接做存在性校验，gate 报"链接目标不存在： path#L…"。检查器按纯文本正则扫描，对 markdown 语法（含行内代码）无感知。

**影响**：gate 报错阻塞，且错误消息指向一个"根本不是链接"的位置。

**绕法**：解释格式用文字描述（如"标准 file:line 链接引用"），不出现任何 `[...](...)` 字面形；必须展示时给出指向真实文件的完整引用。

## 4. verify_citations.py：两模式输出结构不同，失败均 exit 0

**现象**：existence 模式输出 JSON **对象**（`failure_count` / `total_citations` / `failures`）；extract-lines 模式输出 JSON **数组**（citation + cited_text 元素），没有 failure_count 字段。两种模式即使发现失败，进程退出码也是 0。CLI 上 `--doc` 只收**单个** Markdown 文件路径（必填），不接受目录——与 validate_mermaid 的目录位置参数恰好相反，易混。

**影响**：只看退出码会把全部失败当通过；在 extract-lines 输出里找 failure_count 找不到。

**绕法**：把"解析 JSON"写成固定步骤——existence 校验 `failure_count == 0` 且关注 total_citations 是否符合预期量级；extract-lines 逐条人审 cited_text 是否与文档断言语义一致（本会话 10 篇约 591 条引用全部通过）。

## 5. validate_mermaid.py：只收位置参数，恒 exit 0

**现象**：不接受 `--doc`（报 `unrecognized arguments`），只收位置参数 target，可为单个 .md 文件或目录（目录递归收集）；且恒 exit 0。

**影响**：参数用错时输出 JSON 全空（PARSED-ERR）但退出码 0，容易误判通过。

**绕法**：目录级调用 `validate_mermaid.py docs/distilled`；解析 summary 的 `files` / `blocks` / `passed` / `failed`，`failed == 0` 才算过。另注意：mermaid 节点 label 含中文时用双引号包裹（`A["中文标签"]`）。

## 6. gate.py：退出码可信，但排障必须解析 JSON

**现象**：`gate.py --config code-up.yaml` 的退出码与结果一致（源码 L134：passed 才 exit 0）——exit 0=通过、1=存在 blocking finding、2=配置错误（GateConfigError）。输出 JSON 为 `{passed, errors, warnings, skipped}`；blocking 集合由配置 `gate.fail_on` 决定（默认只含 error）。

**影响**：只看 exit 1 盲目重跑不知道挡在哪条；warning 不阻塞但值得逐条看（本次推测词提示即 warning 级）。

**绕法**：判定通过 = exit 0 **且** JSON `passed == true` **且** `errors == []`；warning/skipped 数组逐条读。另注意 `_preload_docs` 会跳过 `_` 前缀的 .md（如 `_plan.md` 不受门禁检查，属设计行为）。

## 7. assess_components：refs 只匹配裸包名导入

**现象**：`_measure_refs`（assess_components.py L43-53）的反向依赖统计正则只匹配 `from '<组件目录名>'` 与 `require('<组件目录名>')` 两种裸形态，且 name 取的是**目录名**。相对路径导入（`from "./xxx"`、`from "../services/xxx"`）与路径别名导入（`@/lib/services/xxx`、`@repo/*/xxx`）全部漏计。

**影响**：agent-up 的服务调用方全走别名/相对导入，10 个服务的 refs 计数≈0，分量分（refs 权重 0.2）系统性偏低，深度档位被低估。

**绕法**：分数只作深度档位初筛；对 import 形态复杂的仓库必须人工复核反向依赖后修正档位（本次 release-service 即由 standard 人工升档 core 0.633）。候选修法：技能脚本改用"按文件名去引"或解析 import 图。

## 8. assess_components：归一化退化，同维同值失去区分度

**现象**：五维（loc/refs/churn/entry/complexity）按 `raw / peak` 归一化，peak 取全部组件的最大值。当只有一个组件、或某维所有组件同值时：peak=自身 → 该维全得 1.0；peak=0 → 该维全得 0.0。该维不再反映组件间相对差异，score 退化为 0.2 × 非零维数的常数。

**影响**：分数与"组件真实相对分量"脱钩；单组件跑分恒 1.0 或更低常数，阈值分类（0.7 core / 0.3 standard）失去意义。

**绕法**：至少传入一组可比组件统一归一化；单组件场景直接人工定档，不引用分数。refs 维在坑 7 影响下常全体同值（全 0），实际有效维度往往不足五个。

## 9. Glob 工具的 [id] 方括号失效

**现象**：Glob 把 Next.js 动态路由段 `[id]` 当字符组（匹配单字符 i/d），字面目录 `apps/web/app/api/agents/[id]/` 永远匹配不上。

**影响**：误判文件不存在，或以为路由未实现。

**绕法**：用 Grep 按内容定位（如搜处理函数名或路径段），或 Glob 时避开方括号段（对父目录 Glob、对 `[id]` 段用 Bash ls）。

## 10. 推测词检查：warning 级 + 向前 3 行窗口

**现象**：`check_speculation_marked`（code_up_checks.py L253-275）对正文命中"推测/可能/大概"任一词的行，检查其**往前 3 行**（`lines[max(0, i-3): i+1]`，含当前行）内是否有 `[!NOTE] 推测` 标注，缺失则报 **warning**（非 error，默认不阻塞）。另有独立分支：frontmatter 声明 `has_speculation: true` 但全文无 `[!NOTE] 推测` 时报 **error**。

**影响**：warning 会被误当致命错误排障；向后找标注找不到（窗口只向前看）。

**绕法**：默认写作避免三词（"可能"改"可"）；确需推测时，标注放在命中行**之前 3 行内**（紧邻上方最稳）；gate 输出中 warning 仅记录不阻塞。

## 11. mermaid 代码块内禁写 file:line 锚点

**现象**：mermaid 块内出现 `xxx.ts:123` 形文本会违反写作协议（锚点只属于正文引用体系），validate_mermaid/gate 侧对块内容的处理与正文不同，易漏判或误判。

**影响**：门禁报错或产出不可验证的锚点。

**绕法**：mermaid 只写概念名/模块名；所有 file:line 锚点放正文或表格。节点 label 含中文、括号时用双引号包裹。

---

## 验证链最小完备集（本会话最终采用）

```bash
S=~/.qoder/skills/code-up/scripts

# 1+2. 引用验证：--doc 只收单文件，须逐篇循环（两步都解析 JSON）
for f in docs/distilled/*.md; do
  case "$f" in */_*) continue ;; esac
  python3 "$S/verify_citations.py" --doc "$f" --repo-root . --mode existence
  python3 "$S/verify_citations.py" --doc "$f" --repo-root . --mode extract-lines
done

# 3. 对账（防坑 1 静默跳过，脚本见坑 1）

# 4. mermaid：目录位置参数（与 verify_citations 相反），解析 summary.failed
python3 "$S/validate_mermaid.py" docs/distilled

# 5. 门禁：exit 0 且 passed==true 且 errors==[]
python3 "$S/gate.py" --config code-up.yaml
```

四层验证各覆盖不同失败面：existence 管"锚点存在"、extract-lines 管"语义相符"、对账管"有无引用被吞"、gate 管"格式与协议"。任何一层只看退出码都会失守。
