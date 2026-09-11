# GTM — Go-To-Market 物料库

> 面向市场/客户/面试的对外材料。与 `docs/`（工程与设计文档）分离：
> `docs/` 讲「怎么做的」，`GTM/` 讲「为什么值得要」。
> 命名规范：`NN-<主题短横线英文>.md`（NN 为序号），图片资源放 `assets/`。

## 物料索引

| # | 物料 | 受众 | 形态 | 状态 |
|---|------|------|------|------|
| 01 | [企业客户 One-Pager](./01-customer-one-pager.md) | 企业客户 | 文字 | v1.0（2026-08-26） |
| 02 | [面试话术转换指南](./02-interview-playbook.md) | 面试官（全栈 SA / MaaS SA） | 文字 | v1.0（2026-08-26） |
| 03 | [3 分钟演示视频脚本](./03-demo-video-script.md) | 客户 / 面试官（录制统一脚本） | 文字（逐屏台词 + 操作动作 + 预期证据） | v1.0（2026-08-31） |
| 04 | [客户 FAQ](./04-customer-faq.md) | 企业客户（会后答疑） | 文字（10 Q + 速答卡） | v1.0（2026-08-31） |
| W1 | [产品首页](./website/index.html) | 通用（客户/面试统一入口） | 独立静态页（单文件，零构建）· [线上版](https://agent-up.meoo.fun) | v1.8（2026-09-11：新增 Harness 资产演进线 + 多渠道工单接入、测试口径 315/38；v1.7 2026-09-10 新增 MaaS 真实用量聚合 + 任务证据链视图、测试口径 268/36；v1.6 2026-09-09 评测新增确定性断言 + FAILED 批准须留痕、测试口径 260/26；v1.5 2026-09-05 新增发布前 AI 评测闭环、测试口径 251；v1.4 2026-09-03 在线演示入口 + 测试口径 241；v1.3 2026-09-01 六层参考模型嵌套图；v1.2 2026-08-31 实测证据区块；v1.1 impeccable 打磨） |
| W2 | [产品演示版（可点击全流程 Demo）](https://qtb3subkcwy5.meoo.fun) | 客户 / 面试官（自助演示） | Next.js 静态导出 SPA（线上直接点，MOCK 登录 allengaller / 123） | v3（2026-09-03：默认浅色 · 全站中文文案+英文括号备注 · 17 路由 · 深链接自愈） |
| P1 | [GTM 海报](./assets/poster-v1.png) | 通用 | 图片（阿里橙商务风） | v1 |
| P2 | [深色科技风海报](./assets/poster-v2-dark.png) | 技术社区 | 图片（1080×1620，[HTML 源](./assets/poster-v2-dark.html) 可维护；另有 [AI 生成备选版](./assets/poster-v2-dark-ai-alt.png)，中文文案有失真仅作氛围参考） | v2（2026-08-31） |
| W3 | [反馈收集器（Chrome 插件 · PoC）](../chrome-extension/) | 客户 / 面试官（现场演示） | 零构建 MV3 扩展（加载已解压即用）· [安装说明](../chrome-extension/README.md) | v0.1（2026-09-07：一键沉淀带对话证据的反馈，补 L1 入口；仅本地全栈形态） |

**W1 使用方式**：单文件 HTML，双击即开；或任意静态托管，如
`cd GTM/website && python3 -m http.server 4173` → http://localhost:4173。
线上版已发布 Meoo CDN：https://agent-up.meoo.fun （Meoo 会把页面 `<title>` 改写为项目名，属平台标准行为；旧地址 n5x2fzeq9fne.meoo.fun 已 404，外链一律用 agent-up.meoo.fun）

## 核心叙事（所有物料共用，改口径只改这里）

- **一句话定位**：模型是引擎，agent-up 是把引擎变成「持续改进的生产系统」的那层
- **三痛点**：改不动（prompt 在代码里）/ 不敢改（无审批无回滚）/ 说不清（无效果度量）
- **闭环**：反馈 → AI 归因 → 改配置 → 发布前 AI 评测 → 审批发布 → 效果报告 → 一键回滚
- **双形态**：公共云（百炼/DashScope）+ 专有云（Apsara Stack），模型可换、闭环不变
- **自助演示**：https://qtb3subkcwy5.meoo.fun 全流程可点击（MOCK 登录 allengaller / 123，默认浅色）
- **诚实边界**：业务数据 MOCK（有徽标）+ LLM 调用 LIVE（有徽标），主动声明不回避

## 事实口径（对外数字必须与实测一致）

| 口径 | 当前值 | 核实命令 |
|------|--------|---------|
| 测试数 | 334（需本地 PG：`docker compose up -d postgres`） | `cd apps/web && pnpm test` |
| 演示站路由 | 17（含 10 个 Agent 详情静态页） | `cd apps/web && pnpm build:demo`（日志列出生成路由） |
| Zod schema | 29 | `grep -c 'Schema = z' apps/web/lib/schemas.ts` |
| API route 文件 | 38 | `find apps/web/app/api -name route.ts \| wc -l` |
| 真实 LLM 集成点 | 5（探针/归因/摘要/试聊/发布 AI 评测） | 见 `docs/api/api-reference.md` 第四节 |
| 演示账号 | allengaller / 123 | MOCK 登录 |
| MiMo 探针实测 | 2,557ms · 入 45 / 出 73 tokens（mimo-v2.5-pro，2026-08-25） | 见 `docs/reports/2026-08-25-mimo-llm-integration-delivery.md` 第三节 |
| 页面案例引用 | fb-001 / rel-001 / ver-002(0.2.0) / 试聊 ecs-assistant | PostgreSQL 种子（`pnpm db:seed`；MOCK 徽标） |
| 效果报告口径 | 7 天窗口 · 懒计算幂等写回；页面报表数值为演示示例，非实测 | `apps/web/lib/services/effectiveness-service.ts` |

> 项目数字变化后（新增测试/schema/route），先更新本表，再检查 01/02/03/04 四份物料与 W1 产品首页中的引用。

## 待产出（backlog）

物料库 01–04 / W1 / P1–P2 已齐；新需求先在此登记再产出。

| # | 需求 | 状态 |
|---|------|------|
| B1 | Chrome 插件演示动线（反馈收集器 PoC 已入库 `chrome-extension/`，含 README 动线；待录 1 分钟独立片段或并入 03 视频脚本） | 已入库，未录视频 |
| B2 | 03 视频脚本 S4（发布审批）补「AI 评测」镜头（快照回放 PASSED 出镜）；台词同步补 trace→打分→沉淀叙事 | 待重录 / 待剪辑时并入 |
