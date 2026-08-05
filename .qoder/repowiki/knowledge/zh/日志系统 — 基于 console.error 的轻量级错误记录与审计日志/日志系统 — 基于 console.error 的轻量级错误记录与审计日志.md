---
kind: logging_system
name: 日志系统 — 基于 console.error 的轻量级错误记录与审计日志
category: logging_system
scope:
    - '**'
source_files:
    - apps/web/lib/errors.ts
    - apps/web/lib/services/audit-service.ts
    - apps/web/lib/utils.ts
---

本仓库未引入专门的日志框架（如 pino、winston、bunyan 等），而是采用极简策略：在关键异常路径使用 `console.error` 输出结构化前缀，并通过独立的审计服务将业务操作持久化为 JSON 文件。

**使用的系统与工具**
- 仅依赖 Node.js 内置 `console.error` 进行控制台错误输出。
- 审计日志以 JSON 数组形式写入 `data/settings/audit-logs.json`，由 `audit-service.ts` 负责追加写入。

**核心文件与位置**
- `apps/web/lib/errors.ts`：统一错误体系，仅在非测试环境下对未捕获异常调用 `console.error("[unhandled]", err)`，且明确不向响应体泄露堆栈。
- `apps/web/lib/services/audit-service.ts`：审计日志服务，fire-and-forget 语义，失败时通过 `console.error("[audit] recordAudit failed:", err)` 记录，但不影响主业务流程。
- `apps/web/lib/utils.ts`：提供 `error()` / `success()` 等标准 API 响应构造器，本身不产生日志。

**架构与约定**
- 无全局 logger 初始化或中间件；日志分散在出错点附近。
- 所有 `console.error` 调用均带方括号前缀（`[unhandled]`、`[audit]`），便于后续用 grep 或日志聚合工具过滤。
- 审计日志是 append-only 的 JSON 文件，字段包含 `action`、`resource`、`resourceId`、`userName`、`userRole`、`createdAt`、可选 `details`，用于回答「谁在何时做了什么」。
- 审计失败不会抛异常、不会回滚主事务，保证业务写操作的幂等性。

**约束与规则**
- 非测试环境才输出 `console.error`（通过 `process.env.NODE_ENV !== "test"` 判断）。
- 未知错误一律映射为 500 并脱敏消息，禁止将内部堆栈返回给客户端。
- 审计日志与配置变更 diff 分离：前者记录全局行为流，后者记录具体配置差异。