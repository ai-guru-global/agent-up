import { describe, it, expect } from "vitest";
import {
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError,
  AuthorizationError,
  toErrorBody,
} from "@/lib/errors";

describe("AppError subclass status mapping", () => {
  it("NotFoundError -> 404 NOT_FOUND", () => {
    const e = new NotFoundError("x");
    expect(e.status).toBe(404);
    expect(e.code).toBe("NOT_FOUND");
    expect(e.message).toBe("x");
    expect(e).toBeInstanceOf(AppError);
    expect(e).toBeInstanceOf(NotFoundError);
  });

  it("ValidationError -> 422 VALIDATION", () => {
    expect(new ValidationError("x").status).toBe(422);
    expect(new ValidationError("x").code).toBe("VALIDATION");
  });

  it("ConflictError -> 409 CONFLICT", () => {
    expect(new ConflictError("x").status).toBe(409);
    expect(new ConflictError("x").code).toBe("CONFLICT");
  });

  it("AuthorizationError -> 403 AUTHORIZATION", () => {
    expect(new AuthorizationError("x").status).toBe(403);
    expect(new AuthorizationError("x").code).toBe("AUTHORIZATION");
  });

  it("carries details when provided", () => {
    const e = new ValidationError("bad", { field: "name" });
    expect(e.details).toEqual({ field: "name" });
  });
});

describe("toErrorBody", () => {
  it("maps AppError to structured body with correct status", () => {
    const { status, body } = toErrorBody(new NotFoundError("nope"));
    expect(status).toBe(404);
    expect(body).toEqual({
      success: false,
      error: "nope",
      code: "NOT_FOUND",
    });
  });

  it("includes details when present", () => {
    const { body } = toErrorBody(new ValidationError("bad", { k: 1 }));
    expect(body.details).toEqual({ k: 1 });
  });

  it("does NOT include details key when absent", () => {
    const { body } = toErrorBody(new NotFoundError("nope"));
    expect(body).not.toHaveProperty("details");
  });

  it("maps unknown error to 500 INTERNAL", () => {
    const { status, body } = toErrorBody(new Error("boom"));
    expect(status).toBe(500);
    expect(body.code).toBe("INTERNAL");
    expect(body.error).toBe("boom");
  });

  it("maps non-Error thrown value to 500", () => {
    const { status, body } = toErrorBody("wat");
    expect(status).toBe(500);
    expect(body.code).toBe("INTERNAL");
  });
});
