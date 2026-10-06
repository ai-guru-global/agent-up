import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/auth/logout/route";
import { SESSION_COOKIE } from "@/lib/auth-token";

/**
 * 批⑦ 覆盖率扩围：/api/auth/logout 自批① 上线后始终 0% 覆盖，
 * 而它是 HttpOnly 会话下唯一的登出路径（客户端删不掉 cookie）。
 *
 * 处理器刻意不接收 request：不校验令牌、不查库，所以「重复调用仍 200」
 * 本身就是幂等语义的证明，无需伪造过期/非法 cookie 来测。
 */
describe("POST /api/auth/logout", () => {
  it("200 + loggedOut，且下发清除指令的 Set-Cookie", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { loggedOut: true },
    });

    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie.startsWith(`${SESSION_COOKIE}=;`)).toBe(true);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("连续调用（含令牌已过期场景）返回同样的 200，不因重复登出而 401", async () => {
    const first = await POST();
    const second = await POST();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers.get("set-cookie")).toBe(first.headers.get("set-cookie"));
  });
});
