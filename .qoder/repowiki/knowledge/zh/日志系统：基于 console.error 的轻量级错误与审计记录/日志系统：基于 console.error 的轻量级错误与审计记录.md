---
kind: logging_system
name: 日志系统：基于 console.error 的轻量级错误与审计记录
category: logging_system
scope:
    - '**'
source_files:
    - apps/web/lib/errors.ts
    - apps/web/lib/utils.ts
    - apps/web/lib/services/audit-service.ts
---

该仓库未引入专用日志框架（如 pino、winston、bunyan 等），而是采用最简方案：通过 Node.js 内置 `console.error` 输出错误与审计信息，并配合统一的错误体系完成结构化错误响应。

**使用的系统与工具**
- 仅使用 `console.error` 进行错误/异常输出，无日志级别管理、无格式化器、无集中式 sink。
- 审计日志以 JSON 文件形式持久化到 `data/settings/audit-logs.json`，由 `audit-service.ts` 负责 append-only 写入。

**关键文件与位置**
- `apps/web/lib/errors.ts`：定义 `AppError` 及其子类（`NotFoundError`、`ValidationError`、`ConflictError`、`AuthorizationError`），并提供 `toErrorBody` 将任意 thrown 值映射为结构化 HTTP 响应体；未知错误在 `NODE_ENV !== "test"` 时通过 `console.error("[unhandled]", err)` 输出。
- `apps/web/lib/utils.ts`：提供 `handleApiError` 统一入口，把 service 层抛出的 `AppError` 转为 NextResponse，避免各 route 重复处理。
- `apps/web/lib/services/audit-service.ts`：实现 `recordAudit`（fire-and-forget 语义）和 `listAudit`，失败时同样用 `console.error("[audit] recordAudit failed:", err)` 记录。

**架构与约定**
- 错误流与日志流分离：业务错误通过 `AppError` → `toErrorBody` → HTTP 响应返回给客户端；运行时异常/审计失败则直接 `console.error` 输出到标准错误流。
- 审计日志是纯数据追加（append-only），不阻塞主流程，失败仅降级打印，保证业务写操作不因审计失败回滚。
- 所有 API 路由统一通过 `handleApiError` 捕获异常，确保响应体结构一致（`{ success, error, code, details? }`）。

**约束与规范**
- 禁止在响应体中泄露堆栈或内部细节：`toErrorBody` 对未知错误统一脱敏为 `"服务器内部错误"`，仅服务端 `console.error` 保留原始信息。
- 测试环境下跳过 `console.error` 输出（`process.env.NODE_ENV !== "test"` 守卫），避免污染测试输出。
- 审计字段固定为 `{ id, action, resource, resourceId, userName, userRole, createdAt, details? }`，按 `createdAt` 倒序查询。