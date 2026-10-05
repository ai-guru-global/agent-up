import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@agent-up/db";
import { hashPassword } from "@/lib/password-hash";
import { POST } from "@/app/api/auth/login/route";
import { _resetDb } from "@/lib/data/test-db";

/**
 * 登录路由级回归（批④：真实用户库接线）。
 * 覆盖：scrypt 口令校验、大小写归一、未设口令/未知邮箱的同形 401（防用户枚举）、
 * 参数校验 400/422、AUTH_SECRET 存在时下发会话 cookie。
 */

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function withAuthSecret<T>(fn: () => Promise<T>): Promise<T> {
  const saved = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "test-login-secret";
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = saved;
  }
}

async function seedUser(overrides: {
  email?: string;
  password?: string | null;
  name?: string;
}): Promise<void> {
  await prisma.user.create({
    data: {
      id: `u-${overrides.email ?? "a"}`,
      email: overrides.email ?? "user@example.com",
      name: overrides.name ?? "测试用户",
      ...(overrides.password !== null && overrides.password !== undefined
        ? { passwordHash: await hashPassword(overrides.password) }
        : {}),
    },
  });
}

beforeEach(async () => {
  await _resetDb();
});

describe("POST /api/auth/login（真实用户库）", () => {
  it("正确凭据 → 200，sessionIssued=true，下发会话 cookie，身份字段取自用户行", async () => {
    await seedUser({ email: "allen@example.com", password: "pw-123456", name: "张三" });
    const res = await withAuthSecret(() =>
      POST(makeRequest({ email: "allen@example.com", password: "pw-123456" })),
    );
    const body = (await res.json()) as {
      success: boolean;
      data: Record<string, unknown>;
    };
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe("u-allen@example.com");
    expect(body.data.username).toBe("allen@example.com");
    expect(body.data.name).toBe("张三");
    expect(body.data.sessionIssued).toBe(true);
    expect(res.headers.get("set-cookie")).toContain("agentup_session=");
  });

  it("登录输入邮箱大小写归一：库里小写、登录传大写 → 命中", async () => {
    // 契约：入库邮箱统一小写（无注册流程，写入方只有 seed），登录侧把输入
    // trim + toLowerCase 后精确匹配
    await seedUser({ email: "mixed@example.com", password: "pw-123456" });
    const res = await withAuthSecret(() =>
      POST(makeRequest({ email: "MIXED@EXAMPLE.COM", password: "pw-123456" })),
    );
    expect(res.status).toBe(200);
  });

  it("错误口令 → 401 邮箱或密码错误", async () => {
    await seedUser({ password: "pw-123456" });
    const res = await POST(makeRequest({ email: "user@example.com", password: "wrong" }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("邮箱或密码错误");
  });

  it("未知邮箱 → 同一 401 文案（不做用户枚举）", async () => {
    const res = await POST(makeRequest({ email: "nobody@example.com", password: "x" }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("邮箱或密码错误");
  });

  it("passwordHash 为空（未启用口令）→ 同一 401 文案", async () => {
    await seedUser({ password: null });
    const res = await POST(makeRequest({ email: "user@example.com", password: "whatever" }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("邮箱或密码错误");
  });

  it("缺字段 → 400；邮箱格式非法 → 422", async () => {
    const missing = await POST(makeRequest({ email: "user@example.com" }));
    expect(missing.status).toBe(400);
    const badFormat = await POST(makeRequest({ email: "not-an-email", password: "x" }));
    expect(badFormat.status).toBe(422);
  });
});
