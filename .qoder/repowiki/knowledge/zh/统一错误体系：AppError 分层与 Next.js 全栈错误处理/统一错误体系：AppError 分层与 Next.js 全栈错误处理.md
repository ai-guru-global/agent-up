---
kind: error_handling
name: 统一错误体系：AppError 分层与 Next.js 全栈错误处理
category: error_handling
scope:
    - '**'
source_files:
    - apps/web/lib/errors.ts
    - apps/web/lib/utils.ts
    - apps/web/app/components/error-boundary.tsx
    - apps/web/app/global-error.tsx
    - apps/web/app/api/agents/route.ts
    - apps/web/app/api/agents/[id]/config/[partition]/rollback/route.ts
    - apps/web/app/api/agents/[id]/versions/[versionId]/route.ts
---

该仓库在 Next.js Web 应用中建立了一套结构化的错误处理体系，覆盖服务端 API、前端组件与全局异常三个层面。

**1. 核心错误类型（apps/web/lib/errors.ts）**
- 定义 `ErrorCode` 联合类型：`NOT_FOUND`、`VALIDATION`、`CONFLICT`、`AUTHORIZATION`、`INTERNAL`。
- 基类 `AppError` 继承自 `Error`，携带 `status`、`code`、`details` 字段，并通过 `Object.setPrototypeOf` 保证 TS 编译到 ES2017 target 时 instanceof 语义正确。
- 业务错误子类：`NotFoundError`(404)、`ValidationError`(422)、`ConflictError`(409)、`AuthorizationError`(403)。
- `toErrorBody(err)` 将任意 thrown 值映射为 `{ status, body: { success, error, code, details? } }`；对非 `AppError` 的未知错误统一返回 500 + `INTERNAL`，并在非测试环境通过 `console.error` 记录堆栈，绝不泄漏敏感信息给响应体。

**2. API 层统一处理（apps/web/lib/utils.ts）**
- `handleApiError(err)` 调用 `toErrorBody` 后以 `NextResponse.json` 返回结构化响应，所有 route 文件在 try/catch 中统一 return `handleApiError(err)`。
- `validateBody(request, schema)` 基于 Zod 校验请求体，失败直接返回 422 并附带错误消息数组，消除每个 route 重复的 safeParse 样板。
- `success(data, status=200)` 提供标准成功响应格式 `{ success: true, data }`。

**3. 路由层使用模式**
- Service 层抛出具体 `AppError` 子类（如 `NotFoundError("Version 不存在")`、`ValidationError("该 Version 不属于此 Agent")`）。
- Route 层用 `try/catch` 包裹业务逻辑，catch 分支统一 `return handleApiError(err)`。
- 示例路径：`app/api/agents/[id]/config/[partition]/rollback/route.ts`、`app/api/agents/[id]/versions/[versionId]/route.ts` 等。

**4. 前端错误边界（apps/web/app/components/error-boundary.tsx）**
- React Class Component 实现的 `ErrorBoundary`，捕获渲染期错误，显示「页面加载失败」+ 错误消息 + 「重试」按钮。
- 用于包裹需要局部恢复能力的组件树。

**5. 全局错误页（apps/web/app/global-error.tsx）**
- Next.js App Router 的全局错误页面，捕获未处理的运行时错误，展示「应用出错」+ 刷新按钮。

**6. 架构约定**
- 错误从 service → route → `handleApiError` → `toErrorBody` 单向流动，禁止在 route 中直接拼接 JSON 响应。
- 未知错误一律脱敏为 500 + `INTERNAL`，不向客户端暴露内部堆栈。
- 前端通过 `ErrorBoundary` 和 `global-error.tsx` 分别处理组件级与应用级崩溃。