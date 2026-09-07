# docs — 文档体系总索引

> 维护日期：2026-08-26
> 本目录是 agent-up 全部项目文档的入口。文档按「设计 → 评估 → 交付 → 使用」四层组织，
> 时间戳即版本：同主题新一轮产出以新日期另建文件，不覆盖旧文档。

## 目录结构

| 目录 | 定位 | 命名规范 |
|------|------|---------|
| `superpowers/specs/` | 设计规格书（先设计后实施，带状态/版本标记） | `YYYY-MM-DD-<主题>-design.md` |
| `evaluation/` | 项目评估与业界参考 | `YYYY-MM-DD-<主题>.md` |
| `reports/` | 阶段性交付报告与验证证据（见 [reports/README](./reports/README.md)） | `YYYY-MM-DD-<主题>.md` |
| `api/` | API 接口完整说明 | `api-reference.md` |
| `guides/` | 部署指南 / 故障排查手册 | 按主题命名 |

## 一、设计规格书（specs）

| 日期 | 文档 | 状态 | 摘要 |
|------|------|------|------|
| 2026-07-06 | [MVP 设计](./superpowers/specs/2026-07-06-agent-improvement-platform-mvp-design.md) | Approved → Implemented | 三层 Loop / 四分区 / 发布流 / 数据模型的原始设计 |
| 2026-07-06 | [扩展设计](./superpowers/specs/2026-07-06-agent-improvement-platform-extended-design.md) | Approved → Partially Implemented | L1/L2/L3 完整架构与 Harness 对齐；Prisma 持久化仍为规划 |
| 2026-08-21 | [MaaS 集成 mock 层](./superpowers/specs/2026-08-21-maas-integration-mock-design.md) | Approved → Implemented | `/maas` 页 + 种子数据 MaaS 口径（公共云+专有云双形态） |
| 2026-08-25 | [MiMo 真实 LLM 接入](./superpowers/specs/2026-08-25-mimo-llm-integration-design.md) | Approved → Implemented | LLM 网关 + 4 个真实集成点 |

状态语义：`Draft`（起草）→ `Approved`（用户批准）→ `Implemented`（已交付）/ `Partially Implemented`（部分落地）。

## 二、评估文档（evaluation）

| 日期 | 文档 | 状态 | 摘要 |
|------|------|------|------|
| 2026-07-21 | [项目评估 + Harness/Loop 参考](./evaluation/2026-07-21-project-evaluation-and-harness-loop-reference.md) | 历史快照 | 八维评分 + 业界 Loop/Harness 工程参考（`/architecture` 页面源） |

## 三、交付报告（reports）

| 日期 | 文档 | 摘要 |
|------|------|------|
| 2026-07-31 | [项目整体评估与行业差距分析](./reports/2026-07-31-project-evaluation-and-industry-gap-analysis.md) | 历史快照：五大差距 + P0-P3 路线图 |
| 2026-08-25 | [MiMo 真实 LLM 接入交付报告](./reports/2026-08-25-mimo-llm-integration-delivery.md) | 实测证据 + 踩坑记录 + 文件清单 |

索引与外部页面对应关系详见 [reports/README](./reports/README.md)。

## 四、使用文档（api / guides）

| 文档 | 受众 | 内容 |
|------|------|------|
| [API 接口说明](./api/api-reference.md) | 前端 / 集成方 | 34 个 route 的端点清单、响应约定、错误码、LLM 端点细节 |
| [部署指南](./guides/deployment.md) | 部署 / 演示准备 | 本地启动、环境变量、生产构建、演示前检查清单 |
| [故障排查手册](./guides/troubleshooting.md) | 开发者 | 已知问题与修复模式（env 加载、LLM 错误、测试时间炸弹等） |

## 五、快速入口（仓库根）

- 项目总览 / 快速开始：[根 README](../README.md)
- Web 应用说明：[apps/web/README](../apps/web/README.md)
- 报告目录规范：[reports/README](./reports/README.md)
