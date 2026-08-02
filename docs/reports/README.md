# docs/reports — 项目报告管理目录

本目录集中存放 AgentUp 项目的评估报告、差距分析与阶段性结论文档。**命名规范：`YYYY-MM-DD-<主题短横线英文>.md`**，时间戳即版本——同一主题的新一轮评估以新日期另建文件，不覆盖旧报告。

## 报告索引

| 日期 | 文档 | 类型 | 摘要 |
|------|------|------|------|
| 2026-07-31 | [项目整体评估与行业差距分析](./2026-07-31-project-evaluation-and-industry-gap-analysis.md) | 评估 / 差距分析 | 设计成熟度 vs 实现成熟度评估；与业界（trace/error analysis/golden set/蒸馏闭环）五大差距；工单复盘场景能力盘点；面向复盘场景重排的 P0-P3 路线图 |

## 关联文档（本目录之外）

| 位置 | 文档 | 关系 |
|------|------|------|
| `docs/superpowers/specs/` | [MVP 设计文档](../superpowers/specs/2026-07-06-agent-improvement-platform-mvp-design.md) | 三层 Loop / 四分区 / 数据模型的原始设计依据 |
| `docs/superpowers/specs/` | [扩展设计文档](../superpowers/specs/2026-07-06-agent-improvement-platform-extended-design.md) | L1/L2/L3 完整架构与 Harness 工程对齐 |
| `docs/evaluation/` | [2026-07-21 项目评估与 Harness/Loop 参考](../evaluation/2026-07-21-project-evaluation-and-harness-loop-reference.md) | 上一轮评估（八维评分、Harness/Loop 业界参考），2026-07-31 报告在其基础上补充行业差距与场景分析 |

## 与外部页面的对应关系

报告内容同步呈现在 Web 管理后台的架构介绍页面（科普向），修改报告时需同步检查以下页面一致性：

| 页面路由 | 源文件 | 对应报告章节 |
|------|------|------|
| `/architecture` | `apps/web/app/(dashboard)/architecture/page.tsx` | 第一章（总体评估、设计理念科普）、第二章（行业差距）、第四章（技术债） |
| `/architecture/roadmap` | `apps/web/app/(dashboard)/architecture/roadmap/page.tsx` | 第五章（路线图与优先级矩阵、工单复盘场景优先级） |
| `/architecture/loop` | `apps/web/app/(dashboard)/architecture/loop/page.tsx` | 三层 Loop 理念（源自设计文档） |
| `/architecture/harness` | `apps/web/app/(dashboard)/architecture/harness/page.tsx` | Harness 工程参考（源自 2026-07-21 评估） |
