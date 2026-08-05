---
kind: error_handling
name: 统一错误体系：AppError 类型 + handleApiError 中间件式处理
category: error_handling
scope:
    - '**'
source_files:
    - apps/web/lib/errors.ts
    - apps/web/lib/utils.ts
    - apps/web/app/components/error-boundary.tsx
    - apps/web/app/global-error.tsx
    - apps/web/app/api/agents/[id]/route.ts
    - apps/web/app/api/agents/route.ts
    - apps/web/app/api/__tests__/releases.test.ts
---

## 1. 使用的系统与模式
- 自定义异常层次结构：基于 `Error` 的 `AppError` 基类及其子类（`NotFoundError`、`ValidationError`、`ConflictError`、`AuthorizationError`），配合枚举 `ErrorCode`（NOT_FOUND / VALIDATION / CONFLICT / AUTHORIZATION / INTERNAL）构成结构化错误模型。
- API 层统一捕获与映射：通过 `handleApiError(err)` 把任意 thrown 值转为标准 JSON 响应，未知错误一律脱敏并返回 500，禁止堆栈泄露。
- 前端 React 错误边界：`ErrorBoundary` 组件捕获渲染期错误并提供“重试”；`global-error.tsx` 作为 Next.js App Router 的全局错误页，提供“刷新页面”。

## 2. 关键文件与位置
- `apps/web/lib/errors.ts`：定义 `ErrorCode`、`AppError` 及所有业务错误子类，以及 `toErrorBody` 映射器。
- `apps/web/lib/utils.ts`：暴露 `success`、`error`、`validateBody`、`parseBody`、`handleApiError` 等 API 辅助函数，是 Route Handler 的错误入口。
- `apps/web/app/components/error-boundary.tsx`：客户端组件级错误边界。
- `apps/web/app/global-error.tsx`：Next.js 全局错误页面。
- `apps/web/app/api/**/route.ts`：各 API Route Handler 中统一使用 `try/catch` + `handleApiError(err)` 捕获异常。
- `apps/web/app/api/__tests__/releases.test.ts`：测试用例显式断言 409 ConflictError，体现错误码在测试中的契约作用。

## 3. 架构与约定
- **分层职责**
  - Service/业务层：抛出 `AppError` 子类，携带精确 HTTP status 与 code。
  - API 层（Route Handler）：用 `try/catch` 包裹业务调用，`catch` 分支统一走 `handleApiError(err)`，由 `toErrorBody` 决定状态码与响应体。
  - 前端 UI：组件级 `ErrorBoundary` 兜住渲染错误；`global-error.tsx` 兜住应用级崩溃。
- **响应格式**
  - 成功：`{ success: true, data }`
  - 失败：`{ success: false, error, code, details? }`，其中 `code` 来自 `ErrorCode` 枚举。
- **校验与参数解析**
  - `validateBody(schema)` 对请求体做 Zod 校验，失败直接返回 422 并附带 `errors` 数组，避免在每个 route 重复样板代码。
- **安全约束**
  - 非 `AppError` 的未知异常一律视为 `INTERNAL`，消息脱敏为“服务器内部错误”，并在非 test 环境打印日志，绝不向客户端泄露堆栈。

## 4. 约定与约束（从实现可观察到的规则）
- 所有 API Route Handler 必须通过 `handleApiError` 处理抛出的异常，不得自行构造错误响应体绕过 `code` 字段。
- 业务错误必须继承 `AppError` 并使用预定义子类，禁止直接用字符串匹配（如 `includes("不存在")`）判断 404。
- 未捕获异常不会泄露敏感信息：`toErrorBody` 对非 Error 对象和未知 Error 均返回固定消息，仅在生产环境记录日志。
- 前端组件如需局部错误恢复，应使用 `ErrorBoundary`；应用级崩溃由 `global-error.tsx` 接管并提供刷新能力。
- 测试中通过断言具体错误类型（如 `ConflictError`）来验证行为，确保错误契约稳定。

## 5. 覆盖范围与局限
- 当前错误体系集中在 `apps/web` 的 lib 与 API 层；`packages/db`、`packages/shared`、`packages/ui` 尚未发现统一的错误类型复用或传播机制。
- 未发现 Node.js 层面的 `process.on('uncaughtException')` / `unhandledRejection` 全局处理器，也未见专门的错误上报服务集成。