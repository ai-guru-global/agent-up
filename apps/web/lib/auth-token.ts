/**
 * 会话令牌：HMAC-SHA256 签名的不透明令牌，是**唯一不可伪造的身份来源**。
 *
 * 为什么不用 JWT 库：只需要「签名 + 过期」两件事，node:crypto 足够，
 * 不为此引入依赖。格式 v1.<base64url(payload)>.<base64url(sig)>，
 * 前缀版本号留出将来换算法的余地。
 *
 * 仅服务端可用（依赖 node:crypto）。resolveActor 在 lib/context.ts 消费本模块。
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Actor } from "./context";

/** 会话 cookie 名；同时接受 x-actor-token 头（供非浏览器客户端使用） */
export const SESSION_COOKIE = "agentup_session";

export const TOKEN_HEADER = "x-actor-token";

const TOKEN_PREFIX = "v1";

interface TokenPayload extends Actor {
  /** 签发时间（秒） */
  iat: number;
  /** 过期时间（秒） */
  exp: number;
}

/** 签名密钥。未配置时签发与校验一律失败——身份失败关闭，不静默降级。 */
function authSecret(): string | null {
  const secret = process.env.AUTH_SECRET?.trim();
  return secret ? secret : null;
}

function sessionTtlSeconds(): number {
  const hours = Number(process.env.AUTH_SESSION_TTL_HOURS);
  return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 3600;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * 签发令牌。未配置 AUTH_SECRET 时返回 null，由调用方决定是否告警。
 */
export function signActorToken(actor: Actor): string | null {
  const secret = authSecret();
  if (!secret) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    id: actor.id,
    name: actor.name,
    role: actor.role,
    iat: now,
    exp: now + sessionTtlSeconds(),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${TOKEN_PREFIX}.${body}.${sign(body, secret)}`;
}

/**
 * 校验令牌。任何异常（格式、签名、过期、payload 结构）都返回 null，
 * 调用方必须把 null 当作「无可信身份」，绝不回落到客户端自述的头。
 */
export function verifyActorToken(token: string): Actor | null {
  const secret = authSecret();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const [, body, signature] = parts;

  // 长度不等时 timingSafeEqual 会抛异常，先挡住；比较本身必须恒定时间
  const expected = Buffer.from(sign(body, secret), "utf8");
  const actual = Buffer.from(signature, "utf8");
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;

  const p = payload as Partial<TokenPayload>;
  if (typeof p.id !== "string" || !p.id) return null;
  if (typeof p.name !== "string" || !p.name) return null;
  if (typeof p.role !== "string" || !p.role) return null;
  if (typeof p.exp !== "number" || p.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return { id: p.id, name: p.name, role: p.role };
}

/** 从 Cookie 头里取出会话令牌（无 cookie 依赖，手工解析） */
function tokenFromCookieHeader(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    if (value) return value;
  }
  return null;
}

/**
 * 取会话令牌：显式头优先于 cookie。
 * 头供非浏览器客户端（如 chrome-extension）使用，cookie 供浏览器 UI 使用。
 */
export function readSessionToken(headers: Headers): string | null {
  return (
    headers.get(TOKEN_HEADER)?.trim() ||
    tokenFromCookieHeader(headers.get("cookie")) ||
    null
  );
}

/**
 * 生成 Set-Cookie 值。生产环境追加 Secure；本地 http 下加了会导致浏览器丢弃 cookie。
 */
export function sessionCookieValue(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionTtlSeconds()}${secure}`;
}
