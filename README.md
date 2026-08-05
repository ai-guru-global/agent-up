# Agent 改进平台 (agent-up)

> better agent, better life

基于三层 Loop 设计理念的 Agent 持续改进管理平台。面向专有云工单场景，支持各产品组维护改进各自的 Agent 配置（Prompt / 知识库 / 工具 / 路由），通过审批流程发布新版本。

## 技术栈

- **框架**: Next.js 16 (App Router, Turbopack)
- **语言**: TypeScript (strict mode)
- **样式**: Tailwind CSS 4
- **校验**: Zod（21 个 schema 覆盖所有 API 入参）
- **测试**: Vitest 3 + v8 coverage（214 个测试，94% 语句覆盖）
- **数据库**: PostgreSQL 16 + Prisma ORM（schema 已就绪，运行时暂用 JSON 文件）
- **对象存储**: MinIO (S3 兼容)
- **构建**: Turborepo monorepo + pnpm workspaces

## 项目结构

```
agent-up/
├── apps/
│   └── web/                        # Next.js 全栈应用
│       ├── app/                    # App Router
│       │   ├── (auth)/             # 登录页
│       │   ├── (dashboard)/        # 工作台页面
│       │   │   ├── agents/         # Agent 管理 + 四分区编辑器
│       │   │   ├── releases/       # 发布审批 + diff 查看器
│       │   │   ├── architecture/   # 架构参考（Loop / Harness / Roadmap）
│       │   │   ├── feedback/       # 反馈管理
│       │   │   ├── skills/         # Skills 管理
│       │   │   ├── wiki/           # 知识库管理
│       │   │   └── settings/       # 设置（角色/权限/审计日志）
│       │   ├── api/                # API 路由（26 个端点）
│       │   └── components/         # 共享组件（含 mermaid 渲染器）
│       ├── lib/
│       │   ├── errors.ts           # 结构化错误体系（AppError 层级）
│       │   ├── context.ts          # Actor 请求上下文（为 NextAuth 留接口）
│       │   ├── versioning.ts       # 语义化版本（SemVer）计算
│       │   ├── schemas.ts          # Zod 校验 schema（15 个）
│       │   ├── diff.ts             # JSON diff 工具
│       │   ├── utils.ts            # API 响应 / 分页 / validateBody
│       │   ├── data/store.ts       # JSON 文件存储（可注入临时目录）
│       │   └── services/           # 业务逻辑层
│       │       ├── agent-service          # Agent CRUD + 配置版本管理
│       │       ├── release-service        # 发布流（真实 diff + SemVer + 审计）
│       │       ├── feedback-service       # 反馈（含状态机校验）
│       │       ├── skill-service          # Skills + 绑定
│       │       ├── wiki-service           # Wiki Vault + Page
│       │       ├── effectiveness-service  # 版本效果报告（懒计算）
│       │       └── audit-service          # 审计日志（append-only）
│       └── data/                   # 种子数据（JSON 文件）
├── packages/
│   ├── db/                         # Prisma 数据库层（schema 就绪）
│   ├── shared/                     # 共享类型定义
│   └── ui/                         # UI 组件库（预留）
├── docs/                           # 设计文档 + 评估文档
│   ├── superpowers/specs/          # MVP + 扩展设计
│   └── evaluation/                 # 项目评估 + Harness/Loop 参考
├── docker-compose.yml              # PostgreSQL + MinIO
└── turbo.json                      # Turborepo 配置
```

## 快速开始

### 前置条件

- Node.js >= 20
- pnpm >= 9

### 安装

```bash
pnpm install
```

### 开发

```bash
pnpm dev
```

访问 http://localhost:3000

> **关于基础设施**：本仓库**当前**使用文件 JSON 存储（`apps/web/data/` 目录）跑通开发体验，
> 数据流是 `lib/data/store.ts` → 文件系统。`docker-compose.yml`（PostgreSQL + MinIO）
> 与 `packages/db/prisma/schema.prisma` 是为下一阶段（持久化落地）准备的，
> 业务代码尚未接入 Prisma Client，因此**不需要** `docker compose up` 或 `pnpm db:push`。

### 测试

```bash
cd apps/web
pnpm test                # 运行全部测试（单元 + API 集成）
pnpm test -- --coverage  # 带覆盖率报告
```

**214 个测试，94% 语句覆盖，18 个测试文件：**

- **单元测试**（`lib/__tests__/`，12 个文件）：versioning、errors、schemas、diff、store、audit-service、release-service、feedback-service（状态机）、agent-service、skill-service、wiki-service、utils
- **API 集成测试**（`app/api/__tests__/`，6 个文件）：agents、releases（含审批流 + diff）、feedback、skills、wiki、versions/rollback、effectiveness 全链路，验证 status / body / 审计副作用
- **隔离**：每个测试用临时数据目录（`_setDataDir`），绝不污染仓库种子数据

## 核心概念

### 三层 Loop

| Loop | 时间尺度 | 说明 |
|------|---------|------|
| L1 即时交互环 | 分钟级 | Agent 运行时与用户互动（不在本平台实现） |
| L2 产品改进环 | 小时~天级 | 产品组基于反馈改进 Agent（**本平台核心**） |
| L3 智能进化环 | 天~周级 | 跨 Agent 洞察（预留扩展） |

### Agent 四分区配置

每个 Agent 包含四个可编辑分区：

1. **Prompt** — 系统提示词、角色定义、约束
2. **Knowledge** — Wiki 知识层（llm-wiki 蒸馏态）
3. **Tools** — MCP 工具 + Wiki 查询工具
4. **Routing** — 路由规则、升级策略

### 发布流程

编辑配置 → 提交发布（Release，自动 diff 上一版本 + 真 SemVer）→ 工单团队审批 → 生成不可变版本快照（Version）→ 可分区级一键回滚 → 发布 7 天后自动生成效果报告

### 三角色模型

- **工单团队**（管理员）：审批发布、全局管理
- **产品组**：编辑本产品组的 Agent 配置
- **CRE**：查看反馈、录入改进建议

## API 端点

| 分类 | 端点 | 功能 |
|------|------|------|
| Agent | `GET/POST /api/agents` | 列表 / 创建 |
| | `GET/PUT/DELETE /api/agents/[id]` | 详情 / 更新 / 归档 |
| | `GET/PUT /api/agents/[id]/config/[partition]` | 四分区配置读写 |
| | `POST /api/agents/[id]/config/[partition]/rollback` | **分区级一键回滚** |
| | `GET /api/agents/[id]/versions` | 版本历史（含效果报告） |
| | `GET /api/agents/[id]/versions/[versionId]` | 单个版本详情 |
| | `POST /api/agents/[id]/rollback/[versionId]` | 整版本回滚 |
| | `POST/DELETE /api/agents/[id]/skills` | Skill 绑定 / 解绑 |
| | `POST /api/agents/[id]/release` | 提交发布 |
| Release | `GET /api/releases` | 发布列表 |
| | `GET /api/releases/[id]` | **单个 Release（含 configSnapshot + baseline）** |
| | `PUT /api/releases/[id]/review` | 审批（通过/拒绝/需修改） |
| Feedback | `GET/POST/PUT /api/feedback` | 反馈 CRUD（含状态机） |
| Skills | `GET/POST /api/skills` · `GET/PUT/DELETE /api/skills/[id]` | Skills CRUD |
| Wiki | `GET/POST /api/wiki/vaults` · vault/page CRUD | 知识库管理 |
| Settings | `GET/POST /api/settings/{roles,permissions,product-groups,audit-logs}` | RBAC + 审计 |
| Dashboard | `GET /api/dashboard` | 聚合统计 |

## 工程纪律（已落地）

| 纪律 | 实现 | 文件 |
|------|------|------|
| **结构化错误** | AppError 层级 → 精确 HTTP status；消除字符串匹配 | `lib/errors.ts` |
| **Zod 全量校验** | 21 个 schema 覆盖所有 API 入参 | `lib/schemas.ts` |
| **Actor 上下文** | 请求头解析 actor（为 NextAuth 留接口）；消除硬编码 | `lib/context.ts` |
| **审计日志** | 所有写操作 append-only 审计 | `lib/services/audit-service.ts` |
| **真 SemVer** | 按分区变更范围计算版本号（patch/minor） | `lib/versioning.ts` |
| **反馈状态机** | 非法状态转移被拒（如 NEW→RESOLVED） | `feedback-service.ts` |
| **Store 加固** | crypto.randomUUID；损坏文件抛结构化错误 | `lib/data/store.ts` |

## 架构参考（Web 页面）

侧边栏「架构参考」分组下有 4 个页面，用 mermaid 图 + 表格全面展示：

| 页面 | 内容 |
|------|------|
| `/architecture` | 项目定位 + 功能完整性八维评分 + 创意性评估 + 关键缺口 |
| `/architecture/loop` | Loop 工程（ReAct / Anthropic / Manus / OpenAI Swarm + 三层 Loop 对齐 + 失败模式诊断 + 参考来源） |
| `/architecture/harness` | Harness 工程（术语 + 五子系统 + OpenAI 七决策 + Anthropic 三体 + smolagents + 反模式 + 参考来源） |
| `/architecture/roadmap` | 改进路线图（优先级矩阵 + P0/P1/P2/P3 + 进度标记） |

## 环境变量

参考 `.env.example`。**当前 dev 不强依赖任何外部服务**（数据走文件 JSON），

- `DATABASE_URL` — PostgreSQL 连接串（暂未使用）
- `NEXTAUTH_URL` / `NEXTAUTH_SECRET` — NextAuth 接入位（暂未使用）
- `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` — MinIO/S3 配置（暂未使用）
- `WIKI_GIT_BASE_PATH` — Wiki Vault 仓库本地路径（暂未使用）
