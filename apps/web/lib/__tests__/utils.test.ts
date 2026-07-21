import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  parsePagination,
  paginationMeta,
  parseBody,
  success,
  error,
  validateBody,
  handleApiError,
} from "../utils";
import { NotFoundError, ValidationError } from "../errors";

describe("parsePagination", () => {
  it("returns defaults for empty params", () => {
    const params = new URLSearchParams();
    const result = parsePagination(params);
    expect(result).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
  });

  it("parses page and pageSize", () => {
    const params = new URLSearchParams({ page: "3", pageSize: "10" });
    const result = parsePagination(params);
    expect(result).toEqual({ page: 3, pageSize: 10, skip: 20, take: 10 });
  });

  it("clamps page to minimum 1", () => {
    const params = new URLSearchParams({ page: "0" });
    const result = parsePagination(params);
    expect(result.page).toBe(1);
    expect(result.skip).toBe(0);
  });

  it("clamps pageSize to max 100", () => {
    const params = new URLSearchParams({ pageSize: "500" });
    const result = parsePagination(params);
    expect(result.pageSize).toBe(100);
  });

  it("clamps pageSize to min 1", () => {
    const params = new URLSearchParams({ pageSize: "0" });
    const result = parsePagination(params);
    expect(result.pageSize).toBe(1);
  });
});

describe("paginationMeta", () => {
  it("calculates totalPages and hasMore", () => {
    const meta = paginationMeta(1, 20, 50);
    expect(meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 50,
      totalPages: 3,
      hasMore: true,
    });
  });

  it("hasMore is false on last page", () => {
    const meta = paginationMeta(3, 20, 50);
    expect(meta.hasMore).toBe(false);
  });

  it("handles zero total", () => {
    const meta = paginationMeta(1, 20, 0);
    expect(meta.totalPages).toBe(0);
    expect(meta.hasMore).toBe(false);
  });
});

describe("success / error", () => {
  it("success returns correct structure", async () => {
    const res = success({ foo: "bar" }, 201);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json).toEqual({ success: true, data: { foo: "bar" } });
  });

  it("error returns correct structure", async () => {
    const res = error("bad input", 400, ["field required"]);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json).toEqual({
      success: false,
      error: "bad input",
      errors: ["field required"],
    });
  });
});

describe("parseBody", () => {
  it("returns parsed JSON", async () => {
    const request = new Request("http://test", {
      method: "POST",
      body: JSON.stringify({ key: "value" }),
      headers: { "Content-Type": "application/json" },
    });
    const result = await parseBody<{ key: string }>(request);
    expect(result).toEqual({ key: "value" });
  });

  it("returns null for invalid JSON", async () => {
    const request = new Request("http://test", {
      method: "POST",
      body: "not json{{{",
      headers: { "Content-Type": "application/json" },
    });
    const result = await parseBody(request);
    expect(result).toBeNull();
  });
});

describe("validateBody", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("returns ok + data for valid body", async () => {
    const request = new Request("http://test", {
      method: "POST",
      body: JSON.stringify({ name: "abc" }),
      headers: { "Content-Type": "application/json" },
    });
    const result = await validateBody(request, schema);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ name: "abc" });
  });

  it("returns 400 response for unparseable body", async () => {
    const request = new Request("http://test", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const result = await validateBody(request, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const json = await result.response.json();
      expect(json.success).toBe(false);
    }
  });

  it("returns 422 response for schema-invalid body", async () => {
    const request = new Request("http://test", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
      headers: { "Content-Type": "application/json" },
    });
    const result = await validateBody(request, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(422);
    }
  });
});

describe("handleApiError", () => {
  it("maps NotFoundError to 404", async () => {
    const res = handleApiError(new NotFoundError("x"));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.code).toBe("NOT_FOUND");
  });

  it("maps ValidationError to 422", async () => {
    const res = handleApiError(new ValidationError("y"));
    expect(res.status).toBe(422);
  });

  it("maps unknown error to 500", async () => {
    const res = handleApiError(new Error("boom"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.code).toBe("INTERNAL");
  });
});
