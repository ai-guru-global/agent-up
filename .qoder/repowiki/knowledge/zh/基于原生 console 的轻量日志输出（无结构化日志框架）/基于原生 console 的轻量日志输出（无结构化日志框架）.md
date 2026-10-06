---
kind: logging_system
name: 基于原生 console 的轻量日志输出（无结构化日志框架）
category: logging_system
scope:
    - '**'
source_files:
    - apps/web/instrumentation.ts
    - apps/web/lib/errors.ts
    - apps/web/lib/services/audit-service.ts
    - apps/web/app/api/auth/login/route.ts
---

## 1. 使用的系统/方案

仓库没有引入任何第三方日志框架（winston、pino、bunyan、log4js、@opentelemetry 等均未出现）。所有运行时日志均通过 Node.js / Next.js 原生的 `console.log`、`console.error` 直接输出到标准错误流。未定义统一的 log level 枚举，也未实现结构化 JSON 日志或日志路由。

## 2. 关键文件

- `apps/web/instrumentation.ts` — Next.js 启动钩子，用 `console.error` 打印缺失 `AUTH_SECRET` 的错误并 `process.exit(1)`。
- `apps/web/lib/errors.ts` — 统一错误体系；`toErrorBody` 在捕获未知异常时通过 `console.error("[unhandled]", err)` 记录堆栈，同时保证响应体不泄露内部信息。
- `apps/web/lib/services/audit-service.ts` — 审计日志服务（append-only），将业务操作写入 Prisma `auditLog` 表；异步写入失败时用 `console.error("[audit] recordAudit failed:", err)` 兜底记录。
- `apps/web/app/api/auth/login/route.ts` — 登录 API 中直接使用 `console.error` 记录认证相关错误。

## 3. 架构与约定

- **无集中 logger 实例**：每个调用方自行决定何时 `console.error`，不存在全局 logger 初始化或配置。
- **审计日志与运行日志分离**：`audit-service.ts` 把“可查询的业务审计事件”持久化到 SQLite（字段含 `action/resource/resourceId/userName/userRole/details`），而程序运行时的诊断信息仅走 `console.error`，两者互不耦合。
- **fire-and-forget 语义**：审计写入是异步且失败的，catch 分支只打日志不抛错，确保业务写成功不会被审计失败回滚（见 `recordAudit` 注释与 `.catch` 实现）。
- **测试隔离**：多处 `console.error` 调用被 `process.env.NODE_ENV !== "test"` 包裹，避免测试输出污染。

## 4. 约定与约束

- **观察到的约定**：
  - 非测试环境才输出诊断日志（`NODE_ENV !== "test"` 守卫出现在 `errors.ts` 与 `audit-service.ts`）。
  - 未知异常一律以 `[unhandled]` 前缀 + 原始错误对象输出，HTTP 响应体则脱敏为 `"服务器内部错误"` 且 code 固定为 `INTERNAL`。
  - 审计失败以 `[audit] recordAudit failed:` 前缀输出，便于在控制台快速过滤。
  - 启动期关键配置缺失（如 `AUTH_SECRET`）不是静默降级，而是 `console.error` 后 `process.exit(1)`，由进程管理器负责重启与告警。
- **未实现的约束**：仓库中没有 lint 规则强制使用特定日志方法，也没有 schema 校验日志格式——上述模式是代码中的实际用法，而非被工具链强制执行的规范。

## 5. 结论

该仓库的“日志系统”本质上是裸 `console.error` 输出加上一个独立的审计日志持久化层，没有统一的日志级别、结构化字段、采样或远端 sink。若需要结构化日志、分级输出或集中收集，当前代码库尚未提供基础设施。