# GTM — Go-To-Market 物料库

> 面向市场/客户/面试的对外材料。与 `docs/`（工程与设计文档）分离：
> `docs/` 讲「怎么做的」，`GTM/` 讲「为什么值得要」。
> 命名规范：`NN-<主题短横线英文>.md`（NN 为序号），图片资源放 `assets/`。

## 物料索引

| # | 物料 | 受众 | 形态 | 状态 |
|---|------|------|------|------|
| 01 | [企业客户 One-Pager](./01-customer-one-pager.md) | 企业客户 | 文字 | v1.0（2026-08-26） |
| 02 | [面试话术转换指南](./02-interview-playbook.md) | 面试官（全栈 SA / MaaS SA） | 文字 | v1.0（2026-08-26） |
| W1 | [产品首页](./website/index.html) | 通用（客户/面试统一入口） | 独立静态页（单文件，零构建） | v1.2（2026-08-31 实测证据区块：探针/归因/摘要/试聊实录 + 7 天效果报表样式 + 演示动线逐步实测预期；v1.1 impeccable 打磨） |
| P1 | [GTM 海报](./assets/poster-v1.png) | 通用 | 图片（阿里橙商务风） | v1 |

**W1 使用方式**：单文件 HTML，双击即开；或任意静态托管，如
`cd GTM/website && python3 -m http.server 4173` → http://localhost:4173

## 核心叙事（所有物料共用，改口径只改这里）

- **一句话定位**：模型是引擎，agent-up 是把引擎变成「持续改进的生产系统」的那层
- **三痛点**：改不动（prompt 在代码里）/ 不敢改（无审批无回滚）/ 说不清（无效果度量）
- **闭环**：反馈 → AI 归因 → 改配置 → 审批发布 → 效果报告 → 一键回滚
- **双形态**：公共云（百炼/DashScope）+ 专有云（Apsara Stack），模型可换、闭环不变
- **诚实边界**：业务数据 MOCK（有徽标）+ LLM 调用 LIVE（有徽标），主动声明不回避

## 事实口径（对外数字必须与实测一致）

| 口径 | 当前值 | 核实命令 |
|------|--------|---------|
| 测试数 | 232 | `cd apps/web && pnpm test` |
| Zod schema | 23 | `grep -c 'Schema = z' apps/web/lib/schemas.ts` |
| API route 文件 | 30 | `find apps/web/app/api -name route.ts \| wc -l` |
| 真实 LLM 集成点 | 4（探针/归因/摘要/试聊） | 见 `docs/api/api-reference.md` 第四节 |
| 演示账号 | allengaller / 123 | MOCK 登录 |
| MiMo 探针实测 | 2,557ms · 入 45 / 出 73 tokens（mimo-v2.5-pro，2026-08-25） | 见 `docs/reports/2026-08-25-mimo-llm-integration-delivery.md` 第三节 |
| 页面案例引用 | fb-001 / rel-001 / ver-002(0.2.0) / 试聊 ecs-assistant | `apps/web/data/` 种子（MOCK 徽标） |
| 效果报告口径 | 7 天窗口 · 懒计算幂等写回；页面报表数值为演示示例，非实测 | `apps/web/lib/services/effectiveness-service.ts` |

> 项目数字变化后（新增测试/schema/route），先更新本表，再检查 01/02 两份物料中的引用。

## 待产出（backlog）

- [ ] 03 — 3 分钟演示视频脚本（逐屏台词 + 操作动作）
- [ ] 04 — 客户 FAQ（数据安全 / 私有化 / 与百炼关系 / 报价形态）
- [ ] P2 — 深色科技风海报（技术社区传播版）
