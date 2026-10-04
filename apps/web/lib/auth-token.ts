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

/**
 * 生产环境启动期自检：缺 AUTH_SECRET 就拒绝启动。
 *
 * 不在模块顶层 throw，是因为 next build 会把 NODE_ENV 置为 production——顶层抛错
 * 等于要求构建期就配好运行时密钥，构建产物也就无法在环境间平移。改由
 * instrumentation.ts 的 register() 调用：它只在服务进程启动时跑一次，
 * 构建与静态导出都不会触发。
 *
 * 为什么值得让整个进程起不来：缺密钥时登录照样返回成功，只是签不出令牌，
 * 于是所有写操作的审计署名静默落到 anonymous——问责链失效，而系统表面一切正常。
 * 这种故障只会在线上第一次需要追溯时才暴露。
 */
export function assertAuthConfigured(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (authSecret()) return;
  throw new Error(
    "[auth] 生产环境必须配置 AUTH_SECRET。缺失时会话令牌签不出来，" +
      "写操作的审计署名会全部静默落到 anonymous，问责链等于失效。" +
      "生成方式：openssl rand -hex 32",
  );
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

/**
 * 生成清除会话的 Set-Cookie 值。
 *
 * Path / SameSite / Secure 必须与签发时逐字一致：浏览器是按「名字 + Path + Domain」
 * 认定同一个 cookie 的，属性对不上就会被当成另一枚新 cookie 写入，
 * 原来那枚照样留着——这是「登出接口返回成功但用户并没登出」的经典成因。
 */
export function clearSessionCookieValue(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
