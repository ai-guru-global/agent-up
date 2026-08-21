---
kind: error_handling
name: 基于 AppError 统一异常体系与 Next.js Route 错误处理
category: error_handling
scope:
    - '**'
source_files:
    - apps/web/lib/errors.ts
    - apps/web/lib/utils.ts
    - apps/web/app/global-error.tsx
    - apps/web/app/components/error-boundary.tsx
    - apps/web/app/api/agents/route.ts
    - apps/web/app/api/releases/[id]/route.ts
    - apps/web/app/api/agents/[id]/config/[partition]/rollback/route.ts
---

## 1. 使用的系统与方案

该仓库在 Next.js App Router 的 API Route 中采用**自定义异常类 + 统一映射器**的错误处理方案：
- 核心定义位于 `apps/web/lib/errors.ts`，提供 `AppError` 基类及 `NotFoundError`、`ValidationError`、`ConflictError`、`AuthorizationError` 五个业务语义化子类。
- 每个错误携带 `status`（HTTP 状态码）、`code`（枚举型错误码：`NOT_FOUND` / `VALIDATION` / `CONFLICT` / `AUTHORIZATION` / `INTERNAL`）和可选 `details`。
- 所有 API Route 通过 `@/lib/utils` 中的 `handleApiError(err)` 捕获并转换响应；`handleApiError` 内部调用 `toErrorBody` 将任意 thrown 值映射为 `{ success: false, error, code, details? }` 结构体 JSON。
- 前端页面级错误由 Next.js 内置机制兜底：`app/global-error.tsx` 渲染全局错误页，`app/components/error-boundary.tsx` 提供 React 组件级 Error Boundary，用于捕获子树渲染期异常并提供“重试”按钮。

## 2. 关键文件与位置

| 职责 | 文件路径 |
|---|---|
| 错误类型与映射器 | `apps/web/lib/errors.ts` |
| API 响应构造与统一错误入口 | `apps/web/lib/utils.ts` |
| 全局错误页（Next.js App Router） | `apps/web/app/global-error.tsx` |
| 客户端 ErrorBoundary 组件 | `apps/web/app/components/error-boundary.tsx` |
| 各 API Route（示例） | `apps/web/app/api/agents/route.ts`、`apps/web/app/api/releases/[id]/route.ts`、`apps/web/app/api/agents/[id]/config/[partition]/rollback/route.ts` 等 |

## 3. 架构与约定

### 3.1 分层抛错与统一收敛
- **Service 层**（如 `@/lib/services/*`）抛出 `AppError` 子类，例如 `throw new NotFoundError("Version 不存在")`、`throw new ValidationError("该 Version 不属于此 Agent")`。这取代了此前“靠字符串包含判断 404”的脆弱模式（见 `errors.ts` 注释）。
- **API Route 层**使用 `try/catch` 包裹业务调用，统一 `catch (err) { return handleApiError(err); }`，不再自行拼装错误 JSON。
- `handleApiError` → `toErrorBody` 是唯一的 HTTP 响应生成点：对 `AppError` 透传 `status/code/message/details`；对未知错误一律返回 500 + `"服务器内部错误"`，并在非测试环境 `console.error` 打印原始错误，**绝不泄漏堆栈到响应体**。

### 3.2 请求校验错误
- 入参校验通过 `validateBody(request, schema)`（基于 Zod），失败直接返回 422 并附带 `errors[]` 字段，成功则返回 `{ ok: true, data }`，Route 中只需 `if (!validated.ok) return validated.response;`。

### 3.3 成功响应
- 所有成功响应统一走 `success(data, status?)`，返回 `{ success: true, data }` 结构，与错误响应的 `success: false` 形成对称。

### 3.4 前端错误兜底
- `global-error.tsx` 是 Next.js 应用级错误边界，展示“应用出错”页面并提供刷新按钮。
- `error-boundary.tsx` 是普通 React 组件级边界，用于局部捕获渲染期异常，显示“页面加载失败”+错误消息+重试按钮。

## 4. 约定与约束

- **必须抛出的错误类型**：业务侧应抛出 `NotFoundError`、`ValidationError`、`ConflictError`、`AuthorizationError` 之一，而非裸 `throw new Error(...)`，以便获得精确 HTTP 状态码与结构化错误码。
- **Route 层禁止自行拼接错误 JSON**：所有 catch 分支统一调用 `handleApiError(err)`，保证响应格式一致。
- **错误码不可随意扩展**：`ErrorCode` 联合类型为 `"NOT_FOUND" | "VALIDATION" | "CONFLICT" | "AUTHORIZATION" | "INTERNAL"`，新增错误需先扩展该类型。
- **未知错误脱敏**：`toErrorBody` 对非 `AppError` 的异常统一降级为 500 + `"服务器内部错误"`，仅在生产环境外记录日志，防止敏感信息泄露。
- **测试环境例外**：`NODE_ENV !== "test"` 时才 `console.error` 未处理错误，避免污染测试输出。
- **向后兼容保留旧签名**：`utils.ts` 仍暴露 `error(message, status, errors?)` 函数供遗留代码使用，但新代码应优先使用 `handleApiError`。

## 5. 覆盖范围说明

当前错误处理体系集中在 `apps/web` 下的 Next.js 应用内（API Route + 页面）。`packages/db`、`packages/shared`、`packages/ui` 目录在本次检索中未发现独立的错误体系定义，因此本卡片描述的范围限定于 Web 应用层的错误处理实践。