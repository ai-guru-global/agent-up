import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/utils";
import { prisma } from "@agent-up/db";
import { signActorToken, sessionCookieValue } from "@/lib/auth-token";
import { verifyPassword } from "@/lib/password-hash";

/**
 * 邮箱 + 口令登录（2026-10-05 批④接真实用户库）。
 *
 * 账号来源：packages/db/prisma/seed-data.mjs 的种子用户（无注册入口，
 * 演示账号 allengaller@example.com / AgentUp#Demo2026 已公开文档化）。
 * 口令校验走 User.passwordHash（scrypt，lib/password-hash.ts）；
 * 会话令牌的载荷身份取自用户行与其首个角色，令牌签发与校验逻辑
 * （lib/auth-token.ts）与 MOCK 时代完全一致。
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const body = await parseBody<{ email?: string; password?: string }>(request);
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;
  if (!email || !password) {
    return error("请填写邮箱和密码");
  }
  if (!EMAIL_RE.test(email)) {
    return error("邮箱格式不正确", 422);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { roles: { include: { role: true }, take: 1 } },
  });
  // 无用户 / 未设口令 / 口令不符 → 同一响应，不做用户枚举
  if (!user || !user.passwordHash) {
    return error("邮箱或密码错误", 401);
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    return error("邮箱或密码错误", 401);
  }

  const roleName = user.roles[0]?.role.name ?? "anonymous";
  const token = signActorToken({
    id: user.id,
    name: user.name ?? user.email,
    role: roleName,
  });
  if (!token && process.env.NODE_ENV !== "test") {
    // 没有 AUTH_SECRET 就发不出令牌，所有写操作会归因到「匿名」。
    // 生产环境走不到这里——instrumentation.ts 启动期已让进程退出；
    // 这个分支只该在开发环境出现，出现即说明忘了配本地密钥。
    console.error(
      "[auth] AUTH_SECRET 未配置，登录成功但无法签发会话令牌；" +
        "审计署名将落到 anonymous。生产环境缺配置会在启动期直接退出，" +
        "开发环境请在 apps/web/.env 配置。",
    );
  }

  const res = success({
    userId: user.id,
    /** 保留旧字段名 username（值为邮箱），前端与 demo 轨字段集合不变 */
    username: user.email,
    name: user.name ?? user.email,
    /** 令牌是否真的签发成功，便于前端/运维识别「登录了但没会话」的错配 */
    sessionIssued: Boolean(token),
  });
  if (token) res.headers.set("Set-Cookie", sessionCookieValue(token));
  return res;
}
