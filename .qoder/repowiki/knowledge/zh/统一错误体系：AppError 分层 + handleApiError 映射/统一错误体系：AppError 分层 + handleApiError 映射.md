---
kind: error_handling
name: 统一错误体系：AppError 分层 + handleApiError 映射
category: error_handling
scope:
    - '**'
source_files:
    - apps/web/lib/errors.ts
    - apps/web/lib/utils.ts
    - apps/web/app/components/error-boundary.tsx
    - apps/web/app/global-error.tsx
---

该仓库在 Next.js Web 应用中建立了一套结构化的错误处理体系，覆盖服务端 API、前端组件与全局异常捕获三个层面。

1. 错误类型定义（apps/web/lib/errors.ts）
- 定义 ErrorCode 联合类型：NOT_FOUND、VALIDATION、CONFLICT、AUTHORIZATION、INTERNAL。
- 基类 AppError 继承 Error，携带 status、code、details 字段，并通过 Object.setPrototypeOf 维持 instanceof 语义。
- 派生具体业务错误：NotFoundError(404)、ValidationError(422)、ConflictError(409)、AuthorizationError(403)。
- toErrorBody(err) 将任意 thrown 值映射为 { status, body } 结构化体；非 AppError 的未知错误一律返回 500 并脱敏消息，不泄漏堆栈。

2. API 层统一处理（apps/web/lib/utils.ts）
- handleApiError(err) 调用 toErrorBody 后通过 NextResponse.json 返回对应 HTTP 状态码与结构化响应体。
- validateBody(schema) 基于 Zod 校验请求体，失败直接返回 422 响应，消除各 route 重复样板。
- success(data) / error(message, status) 提供标准成功/失败响应构造器。
- 所有 API route 统一使用 try/catch + return handleApiError(err) 模式，如 settings/roles/[id]/route.ts 中抛 NotFoundError、AuthorizationError 等。

3. 前端错误边界（apps/web/app/components/error-boundary.tsx）
- React class 组件 ErrorBoundary 捕获子树渲染期异常，显示「页面加载失败」+ 错误消息 + 重试按钮。
- apps/web/app/global-error.tsx 作为 Next.js 全局错误页，展示「应用出错」及刷新按钮，兜底未捕获异常。

4. 约定与实践
- Service 层抛出 AppError 子类，API 层通过 handleApiError 自动映射到 HTTP 响应，避免字符串匹配判断错误。
- 未知错误统一降级为 500 + INTERNAL code，并在非 test 环境 console.error 记录原始错误。
- 前端通过 ErrorBoundary 与 global-error 两级兜底，保证用户可见的错误界面始终存在。
- 测试用例（如 releases.test.ts）直接断言 ConflictError 返回 409，验证错误类型与状态码的一致性。