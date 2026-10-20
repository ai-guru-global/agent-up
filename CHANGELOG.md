# 更新日志

本项目的所有重要变更都记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本语义遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。
项目尚未切版本 tag，先以日期里程碑组织；首次发版（0.1.0）后转为版本号小节。

## [Unreleased]

### Added

- 开源治理基线：`LICENSE`（MIT）、`CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`、issue / PR 模板、Dependabot 配置（pnpm + GitHub Actions，周更）
- `pnpm typecheck`（`tsc --noEmit`，web + db 双包）、根级 `pnpm test`（经 turbo 分发）与 `pnpm test:coverage`（turbo 不透传 vitest 参数，覆盖率入口走 `--filter`）
- CI 测试步骤升级为带覆盖率门禁（阈值 lines/statements/functions ≥80、branches ≥70 由 CI 强制执行）
- `.editorconfig`

### Changed

- CI 加固：新增 `permissions: contents: read` 最小权限与同分支并发取消（`concurrency`）；新增 typecheck 步骤；Node 版本矩阵扩为 20 + 22；测试步骤从 `cd apps/web && pnpm test` 改为根级 `pnpm test`
- README：徽章与实际测试数对齐（371 → 508），新增 CI 状态与 MIT License 徽章；修正 FAQ 中 SQLite 时代的 `TRUNCATE` 旧口径与「下一步」中已废弃的 PostgreSQL 服务容器表述；参与贡献/许可证章节指向新社区文件

## [2026-10-05] 存储迁移：PostgreSQL → SQLite

### Changed

- 数据库整体迁移为 SQLite 单文件（`packages/db/prisma/dev.db`），删除 `docker-compose.yml` 与 PostgreSQL/MinIO 服务依赖，本地与 CI 均零守护进程
- Prisma schema 适配：enum 移入 `packages/db/src/enums.ts`（const 对象 + union type），Json 字段与标量数组改 String 存储，读写经 `packJson / unpackJson` 收口
- CI 去掉 postgres 服务容器，改用 job 级 `DATABASE_URL=file:./ci.db`

## [2026-09] Prisma 持久化与评测闭环

### Added

- Prisma 持久化批 0–5：全业务运行时走数据库（Agent / 发布 / 反馈 / Skills / Wiki / 审计 / trace），种子 `pnpm db:seed` 灌入
- 评测闭环：试聊 trace 落盘与打分 → 沉淀评测用例库 → 发布前 AI 评测（快照 replay + 确定性断言 + 判官模型）
- Wiki 语料编译：`knowledge/` markdown 编译为两轨唯一语料入库；BM25-lite 检索接入 `GET /api/wiki/vaults/[id]/search`，CJK 虚词停用与单字半权抑制高频字污染
- 版本效果报告（发布 7 天后懒计算）、任务证据链、资产演进线、MaaS 每 Agent 真实用量聚合

### Changed

- 覆盖率门禁扩围：`app/api/**/route.ts`（40 个路由）纳入统计，清零 5 个 0% 路由；三组口径实测后维持 80/80/80/70 阈值不下调
- RBAC 在服务层强制执行；生产模式 cookie 行为以 E2E 矩阵固化

### Fixed

- `audit-logs` GET 权限拒绝时返回结构化 403 而非 500

## [2026-08] 真实 LLM 接入与 MaaS 集成展示

### Added

- 小米 MiMo 真实 LLM 接入（OpenAI 兼容协议）：连通性测试、反馈 AI 归因、发布 AI 变更摘要、Agent 试聊 Playground 等集成点；env 凭据零硬编码，缺失时端点降级 503，页面以 LIVE / MOCK 徽标区分
- `/maas` 集成展示页：公共云 + 专有云双形态产品矩阵与模型路由策略
- Chrome 插件 PoC（MV3 反馈收集器）：试聊场景一键沉淀反馈直落反馈池

## [2026-07] MVP

### Added

- 三层 Loop 理念下的 Agent 改进平台 MVP：四分区编辑器（Prompt / Knowledge / Tools / Routing）、分区级草稿保存
- 发布审批流：真 diff + SemVer 自动计算 + 不可变版本快照；双粒度回滚（分区级 / 整版本）
- 反馈闭环：严重程度分诊 → AI 归因 → 定位分区改进 → 发布验证；状态机拒绝非法流转
- RBAC 三角色模型与 append-only 审计日志；Skills / Wiki Vault + Page 管理；架构参考页（Loop / Harness / Roadmap）
