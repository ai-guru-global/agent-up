# Agent 改进平台 (agent-up)

> better agent, better life

基于三层 Loop 设计理念的 Agent 持续改进管理平台。面向专有云工单场景，支持各产品组维护改进各自的 Agent 配置（Prompt / 知识库 / 工具 / 路由），通过审批流程发布新版本。

## 技术栈

- **框架**: Next.js 16 (App Router, Turbopack)
- **语言**: TypeScript (strict mode)
- **样式**: Tailwind CSS 4
- **数据库**: PostgreSQL 16 + Prisma ORM
- **对象存储**: MinIO (S3 兼容)
- **构建**: Turborepo monorepo + pnpm workspaces
- **校验**: Zod

## 项目结构

```
agent-up/
├── apps/
│   └── web/                  # Next.js 全栈应用
│       ├── app/              # App Router 页面 & API
│       │   ├── (auth)/       # 登录页
│       │   ├── (dashboard)/  # 工作台页面
│       │   ├── api/          # API 路由
│       │   └── components/   # 共享组件
│       └── lib/              # 业务逻辑层
│           ├── schemas.ts    # Zod 校验
│           ├── services/     # 服务层
│           ├── utils.ts      # 工具函数
│           └── diff.ts       # JSON diff
├── packages/
│   ├── db/                   # Prisma 数据库层
│   ├── shared/               # 共享类型定义
│   └── ui/                   # UI 组件库（预留）
├── docs/                     # 设计文档
├── docker-compose.yml        # PostgreSQL + MinIO
└── turbo.json                # Turborepo 配置
```

## 快速开始

### 前置条件

- Node.js >= 20
- pnpm >= 9

### 安装

```bash
pnpm install
```

### 启动基础设施

```bash
docker compose up -d
```

### 数据库初始化

```bash
pnpm db:generate
pnpm db:push
```

### 开发

```bash
pnpm dev
```

访问 http://localhost:3000

### 测试

```bash
cd apps/web
pnpm test
```

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

编辑配置 → 提交发布（Release）→ 工单团队审批 → 生成版本快照（Version）→ 可回滚

### 三角色模型

- **工单团队**（管理员）：审批发布、全局管理
- **产品组**：编辑本产品组的 Agent 配置
- **CRE**：查看反馈、录入改进建议

## 环境变量

参考 `.env.example`，核心变量：

- `DATABASE_URL` — PostgreSQL 连接串
- `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` — MinIO 配置
