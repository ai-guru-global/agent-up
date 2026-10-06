---
kind: error_handling
name: AgentUp 错误处理体系：AppError 分层 + handleApiError 统一映射 + Next.js 错误边界
category: error_handling
scope:
    - '**'
source_files:
    - apps/web/lib/errors.ts
    - apps/web/lib/utils.ts
    - apps/web/app/global-error.tsx
    - apps/web/app/(dashboard)/error.tsx
    - apps/web/app/components/error-boundary.tsx
    - apps/web/lib/services/agent-service.ts
    - apps/web/lib/services/feedback-service.ts
    - apps/web/lib/services/release-service.ts
    - apps/web/lib/services/rbac.ts
    - apps/web/app/api/agents/[id]/chat/route.ts
---

## 1. 总体方案

AgentUp Web（Next.js App Router）采用「领域异常 → API 响应」两层式错误处理：

- **领域层**：`apps/web/lib/errors.ts` 定义 `AppError` 基类及其子类（`NotFoundError`、`ValidationError`、`ConflictError`、`AuthorizationError`），每个子类绑定固定的 HTTP status 与 `ErrorCode`。
- **API 层**：`apps/web/lib/utils.ts` 暴露 `handleApiError(err)`，调用 `toErrorBody()` 把任意 thrown 值映射为 `NextResponse.json`；service 层只抛 `AppError` 子类，route 层统一 catch 后返回。
- **前端渲染层**：通过 Next.js 内置的 `global-error.tsx`、`(dashboard)/error.tsx` 以及自定义 `components/error-boundary.tsx` 捕获客户端/服务端渲染异常，展示中文友好提示并附带 `error.digest` 编号。

该设计在 `errors.ts` 注释中明确说明目标：「service 层抛 AppError 子类，API 层用 handleApiError 统一映射成 HTTP 响应。消除此前「靠 includes("不存在") 字符串匹配判 404」的脆弱模式。」

## 2. 关键文件

| 文件 | 职责 |
|---|---|
| `apps/web/lib/errors.ts` | 定义 `ErrorCode` 联合类型、`AppError` 基类及 4 个业务子类；提供 `toErrorBody()` 将未知错误脱敏为 500 |
| `apps/web/lib/utils.ts` | 提供 `success()` / `error()` / `handleApiError()` / `validateBody()` 等 API 辅助函数 |
| `apps/web/app/global-error.tsx` | Next.js 全局错误页面，显示应用根层失败时的兜底 UI |
| `apps/web/app/(dashboard)/error.tsx` | Dashboard 段路由级错误边界，承接 Server Component 数据读取异常 |
| `apps/web/app/components/error-boundary.tsx` | 客户端 React 组件级错误边界，隔离单个子树渲染异常 |
| `apps/web/lib/services/*.ts` | 各业务 service 抛出 `AppError` 子类（如 `agent-service.ts`、`feedback-service.ts`、`release-service.ts`、`rbac.ts` 等） |
| `apps/web/app/api/**/route.ts` | API 路由 catch 异常后调用 `handleApiError(err)` |

## 3. 架构与约定

### 3.1 错误类型体系

```text
AppError (base)
├── NotFoundError      → 404, "NOT_FOUND"
├── ValidationError    → 422, "VALIDATION"
├── ConflictError      → 409, "CONFLICT"
└── AuthorizationError → 403, "AUTHORIZATION"
```

所有子类构造签名一致：`(message: string, details?: unknown)`，`details` 透传到响应体。

`ErrorCode` 是严格联合类型，新增错误码需同时修改类型定义和对应子类，由 TypeScript 编译期保证一致性。

### 3.2 Service 层 → Route 层 传播链

Service 层直接 `throw new NotFoundError(...)` / `throw new ConflictError(...)` 等，不捕获；Route 层用 try/catch 捕获后统一 `return handleApiError(err)`。示例见 `agents/[id]/chat/route.ts`、`agents/[id]/eval-cases/route.ts` 等。

### 3.3 API 响应格式

成功响应：`{ success: true, data }`（`utils.success()`）
失败响应：`{ success: false, error: string, code: ErrorCode, details?: unknown }`（`toErrorBody()` 输出）

对未知错误（非 `AppError`），`toErrorBody()` 一律返回 500 + `code: "INTERNAL"`，并在非 test 环境 `console.error("[unhandled]", err)`，但**不泄漏堆栈到响应体**——这是代码显式约束。

### 3.4 请求校验

`validateBody(request, schema)` 基于 Zod：校验失败直接返回 422 响应，携带 `parsed.error.errors.map(e => e.message)` 数组；解析失败返回 400。这消除了 route 内重复的 safeParse 样板。

### 3.5 前端错误边界

- `global-error.tsx`：Next.js 全局错误页，展示 `error.digest` 编号，引导用户刷新或查看终端日志。
- `(dashboard)/error.tsx`：Dashboard 段错误页，解释侧边导航仍可用，列出常见原因（数据库不可用、记录不存在、开发服务未就绪）。
- `components/error-boundary.tsx`：客户端组件级边界，使用 `role="alert"` 语义化错误区域，提供「重试」按钮重置状态。

三者均面向最终用户输出中文提示，并强调「本次错误不会丢失已保存的配置或反馈记录」，以区分渲染错误与持久化操作。

## 4. 观察到的约定与约束

- **领域异常必须继承 `AppError`**：service 层抛出的业务异常均为 `NotFoundError` / `ValidationError` / `ConflictError` / `AuthorizationError` 之一，未见裸 `throw new Error(...)` 从 service 层冒泡到 API 层的用例。
- **API 路由统一通过 `handleApiError` 包装**：所有被测试覆盖的 route 在 catch 块中调用 `handleApiError(err)`，确保 status/code/details 一致。
- **未知错误脱敏**：`toErrorBody()` 对非 `AppError` 的 thrown 值一律返回 500 + `"服务器内部错误"` 消息，不在生产环境输出原始 message（仅在 console.error 中记录）。
- **错误码集中枚举**：`ErrorCode` 类型是唯一合法值来源，新增错误码需同步修改类型与子类，受 TS 编译检查约束。
- **前端错误边界分层**：Next.js 全局错误页 + 路由级错误页 + 组件级 `ErrorBoundary` 三层兜底，分别覆盖应用壳、Server Component 数据读取、客户端渲染三类异常场景。
- **测试断言错误码**：`app/api/__tests__/rbac.test.ts` 等测试直接断言抛出的异常类型（如 `AuthorizationError`），验证错误传播路径。

## 5. 适用范围

本错误处理体系当前仅存在于 `apps/web`（Next.js 应用包）。`packages/db`（Prisma 客户端）、`chrome-extension` 等其他工作区模块未发现统一的错误类型定义，各自独立处理异常。