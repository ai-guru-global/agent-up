/**
 * 统一错误体系。
 *
 * service 层抛 AppError 子类，API 层用 handleApiError 统一映射成 HTTP 响应。
 * 消除此前「靠 includes("不存在") 字符串匹配判 404」的脆弱模式。
 */

export type ErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "AUTHORIZATION"
  | "INTERNAL";

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    code: ErrorCode,
    details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
    // 维持 instanceof 语义（TS 编译到 ES2017 target 时稳妥）
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 404 —— 资源不存在 */
export class NotFoundError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 404, "NOT_FOUND", details);
  }
}

/** 400 / 422 —— 入参或业务规则校验失败 */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, "VALIDATION", details);
  }
}

/** 409 —— 状态冲突（如重复审批、并发覆盖） */
export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, "CONFLICT", details);
  }
}

/** 403 —— 权限不足（占位，为将来接 RBAC 准备） */
export class AuthorizationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 403, "AUTHORIZATION", details);
  }
}

/**
 * 把任意 thrown 值映射成结构化错误体。
 * 未知错误一律 500 并打日志，绝不泄漏堆栈到响应体。
 */
export function toErrorBody(err: unknown): {
  status: number;
  body: { success: false; error: string; code: ErrorCode; details?: unknown };
} {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: {
        success: false,
        error: err.message,
        code: err.code,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    };
  }
  // 兜底：不信任未知错误的信息，统一脱敏
  const message =
    err instanceof Error ? err.message : "服务器内部错误";
  if (process.env.NODE_ENV !== "test") {
     
    console.error("[unhandled]", err);
  }
  return {
    status: 500,
    body: { success: false, error: message, code: "INTERNAL" },
  };
}
