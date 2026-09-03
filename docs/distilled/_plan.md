# code-up 蒸馏计划（人读版）

- 项目：agent-up，模块 `apps/web/lib/services/`（9 个 service，1769 行）
- 计划生成：Task 8a 会话（2026-09-01），机器可读正本见 `_plan.yaml`
- **状态：已获用户批准（2026-09-02）**，本文件由 Task 8b 会话按批准结果补写
- 分量评分口径：assess_components.py 对单目录组件的输出退化为常数 0.6（refs 只匹配裸包名致真实项目恒 0），故文件级评分由 Task 8a 按 depth-guide 五维定义复算，方法声明见 task-8a-report §2.2

## 文档清单（10 篇）

| 文档 | depth | component_score | 预计篇幅 | 写什么 |
|------|-------|-----------------|----------|--------|
| services-overview.md | standard | 0.600 | 150–250 行 | 模块级总览（architecture 模板）：模块在 apps/web 中的位置与职责边界、9 服务一览、服务间与服务外依赖 mermaid 图 |
| release-service.md | **core** | 0.633 | 200–300 行 | 版本发布与回滚命脉：发布状态机、回滚路径、关键决策、数据流、排查指南（全章节） |
| agent-service.md | standard | 0.548 | 150–250 行 | Agent 实体管理与状态流转 |
| wiki-service.md | standard | 0.519 | 150–250 行 | Wiki 知识库管理 |
| skill-service.md | standard | 0.509 | 150–250 行 | Skill 资产管理 |
| feedback-service.md | standard | 0.483 | 120–200 行 | 反馈收集与处理 |
| audit-service.md | standard | 0.439 | 120–200 行 | 审计日志 |
| llm-service.md | standard | 0.379 | 120–200 行 | LLM 提供商接入层 |
| retrieval-service.md | standard | 0.339 | 120–200 行 | 检索能力封装 |
| effectiveness-service.md | standard | 0.312 | 120–200 行 | 改进有效性度量 |

预计总产出约 1800–2600 行（篇幅为估计值，技能文档无篇幅基准）。

## depth 分档依据

- 阈值口径：component_score ≥ 0.7 → core；0.3–0.7 → standard；< 0.3 → shallow（depth-guide.md）
- 9 个 service 文件级评分 0.312–0.633，全部落 standard 带；唯一例外是 release-service.md 人工升档为 core，理由见下节
- services-overview.md 对应 assess_components.py 对目录组件的直接评分 0.600 → standard

## release-service 升档说明（standard → core）

component_score 0.633 < 0.7，依 depth-guide 升档条款人工升 core：

1. depth-guide 对 core 的定义是"改错了会出大事故"——该文件承载版本发布与回滚路径（模块内 LOC 354 最高、90 天 churn 5 次最活跃，佐证其命脉地位）；
2. 0.633 距 core 阈值 0.7 仅差 0.067，属 depth-guide"评分落在边界但蒸馏者判断实际更重要"的边界情形；
3. 依据全文见 task-8a-report §2.3；gate 机器校验不比对 depth 与分数，升档合规性由 frontmatter 真实分数（component_score: 0.633）+ 文档开头一句话说明承担。

## 写作约束（对执行者的提醒）

- 先读源码再写，禁止凭记忆写结论；每个非平凡论断带相对路径 file:line 锚点，文档内禁绝对路径
- 蒸馏非复述：写设计原理与排查原理，不复述代码
- standard 必填：职责/设计原理/依赖/暴露接口/排查指南（其余可省，省略写"（本节暂无内容）"）；core 全章节
- 每篇 ≥1 个 mermaid 图；推测结论按 `> [!NOTE] 推测：…。依据：…` 格式标注
