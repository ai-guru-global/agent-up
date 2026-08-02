---
kind: logging_system
name: 日志系统 — 基于 console.error 的轻量级错误与审计记录
category: logging_system
scope:
    - '**'
source_files:
    - apps/web/lib/errors.ts
    - apps/web/lib/services/audit-service.ts
    - apps/web/app/global-error.tsx
    - apps/web/app/components/error-boundary.tsx
---

本仓库未引入专用日志框架（如 pino、winston、bunyan 等），也没有统一的 logger 初始化或配置。当前日志输出完全依赖 Node.js/浏览器原生的 `console.error`，并以“错误 + 审计”两类用途为主，结构非常轻量。

1. 使用的系统与方式
- 后端/服务端：通过 `console.error` 直接输出错误信息，未封装统一 logger 实例。
- 前端：使用 Next.js App Router 的 `global-error.tsx` 和自定义 `ErrorBoundary` 组件捕获并展示运行时错误，不输出结构化日志。
- 审计日志：通过 `lib/services/audit-service.ts` 将关键操作以 JSON 形式写入 `data/settings/audit-logs.json`，属于应用内 append-only 审计流，而非传统意义上的运行期日志。

2. 关键文件与位置
- `apps/web/lib/errors.ts`：定义 `AppError` 及其子类（`NotFoundError`、`ValidationError`、`ConflictError`、`AuthorizationError`），并在 `toErrorBody` 中对未知异常兜底打印 `console.error("[unhandled]", err)`，同时确保堆栈不泄露到 HTTP 响应体。
- `apps/web/lib/services/audit-service.ts`：实现 `recordAudit` 与 `listAudit`，将审计条目写入 `data/settings/audit-logs.json`；失败时通过 `console.error("[audit] recordAudit failed:", err)` 记录，且不阻塞业务调用（fire-and-forget 语义）。
- `apps/web/app/global-error.tsx`：Next.js 全局错误页面，用于在客户端渲染阶段发生未捕获异常时向用户展示友好提示。
- `apps/web/app/components/error-boundary.tsx`：React 组件级错误边界，捕获子树渲染错误并显示重试按钮。

3. 架构与约定
- 无集中式 logger 模块：各模块直接使用 `console.error` 输出错误，没有统一的 log level、格式化器或 sink 配置。
- 错误分类通过 `ErrorCode` 枚举（`NOT_FOUND`、`VALIDATION`、`CONFLICT`、`AUTHORIZATION`、`INTERNAL`）表达，由 `toErrorBody` 统一映射为 `{ success, error, code, details? }` 结构。
- 审计日志采用独立 JSON 文件存储，字段包含 `id`、`action`、`resource`、`resourceId`、`userName`、`userRole`、`createdAt`、`details?`，与配置变更 diff 分离，回答「谁在何时做了什么」。
- 测试环境通过 `process.env.NODE_ENV !== "test"` 条件跳过部分 `console.error` 输出，避免污染测试输出。

4. 约定与约束
- 所有未被显式处理的异常最终都会落入 `toErrorBody` 的兜底分支，统一返回 500 状态码与脱敏消息，并通过 `console.error` 记录原始错误对象。
- 审计写入失败不得影响主业务流程：`recordAudit` 使用 try/catch 包裹，失败仅记录 `console.error` 且继续返回已生成的条目。
- 前端错误通过 `ErrorBoundary` 和 `global-error.tsx` 两级捕获，保证页面崩溃时可恢复，但不产生结构化日志输出。
- 目前未发现对 `console.log`、`console.warn`、`console.debug` 的系统性使用，也未发现日志级别策略或日志轮转/聚合机制。