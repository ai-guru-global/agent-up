---
kind: design
name: 采用 Next.js 15 App Router + Server Actions 的全栈架构
source: session
category: adr
---

# 采用 Next.js 15 App Router + Server Actions 的全栈架构

_来源：71d783f → 14c2c2e 提交周期内记录的编码计划——内容为规划时意图，实现可能滞后或有出入。_

**状态：** accepted

## 背景
Agent 持续改进平台需要同时提供前端管理界面和后端 API，MVP 阶段团队希望快速搭建可运行的全栈应用，避免前后端分离带来的部署和跨域复杂度。

## 决策驱动
- 开发效率优先
- 减少服务间调用复杂度
- 利用 React Server Components 提升首屏性能

## 备选方案
- **Next.js 15 App Router + Server Actions** — 优点：前后端统一代码库、RSC 原生支持、无需额外 API 网关、生态成熟；缺点：对传统 REST/GraphQL 习惯的迁移成本
- **前后端分离（React + Express/FastAPI）** _（已否决）_ — 优点：技术栈解耦、独立伸缩；缺点：增加跨域、认证传递、部署复杂度；MVP 阶段收益有限

## 决策
选择 Next.js 15 App Router 作为统一运行时，使用 Server Actions 处理写操作、Route Handlers 暴露只读 API，配合 Prisma ORM 直连 PostgreSQL，通过 pnpm workspace + Turborepo 组织 monorepo（apps/web + packages/ui + packages/db + packages/shared）。

## 影响
单服务部署简化了 MVP 阶段的运维；Server Actions 减少了样板代码但要求团队学习新的数据获取模式；后续如需拆分微服务可通过 Route Handlers 逐步演进。