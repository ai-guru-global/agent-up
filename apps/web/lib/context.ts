/**
 * 请求级 actor 上下文。
 *
 * 身份来源优先级（lib/auth-token.ts 提供签名校验）：
 * 1. 签名会话令牌（cookie `agentup_session` 或头 `x-actor-token`）——唯一不可伪造的来源；
 * 2. 明文 `x-actor-id / x-actor-name / x-actor-role` 头——**仅在显式信任时**采纳；
 * 3. 都不可信 → ANONYMOUS_ACTOR。
 *
 * 为什么明文头还能存在：chrome-extension 与本地联调靠它声明身份，且既有测试直接
 * 调 route handler（不经过任何边缘层）。因此信任开关默认「非 production 开启」，
 * 生产环境必须靠 AUTH_TRUST_ACTOR_HEADERS=1 显式打开（仅限可信内网部署）。
 *
 * 校验失败**绝不回落**到明文头：令牌存在却验不过，说明有人在伪造，
 * 此时给匿名而不是给它自述的角色。
 *
 * 所有写操作（service 层）都应通过 getActor() 获取 actor，不再散落硬编码 "system"。
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { readSessionToken, verifyActorToken } from "@/lib/auth-token";

export interface Actor {
  id: string;
  name: string;
  role: string;
}

/**
 * 系统主体：进程内自发动作（定时任务、后台重算）的署名。
 * 刻意保留 platform_admin——它不来自任何请求，无法被外部注入。
 */
const SYSTEM_ACTOR: Actor = {
  id: "system",
  name: "系统",
  role: "platform_admin",
};

/**
 * 匿名主体：请求到达但拿不出可信身份。
 * role 刻意**不是** platform_admin——「未认证」绝不能等于「超管」。
 */
const ANONYMOUS_ACTOR: Actor = {
  id: "anonymous",
  name: "匿名",
  role: "anonymous",
};

// AsyncLocalStorage 让 actor 贯穿 await 之后的异步续体。
// 批1 起 route handler 闭包内是 async Prisma 调用，模块级同步栈会在
// 第一个 await 后丢上下文（审计署名错乱），故必须用 ALS。
const actorStorage = new AsyncLocalStorage<Actor>();

/** 是否采纳未签名的 x-actor-* 头。显式环境变量优先于 NODE_ENV 推断。 */
function trustUnsignedActorHeaders(): boolean {
  const flag = process.env.AUTH_TRUST_ACTOR_HEADERS;
  if (flag === "1") return true;
  if (flag === "0") return false;
  return process.env.NODE_ENV !== "production";
}

/**
 * 从请求解析 actor。返回的 Actor 要么是签名令牌校验通过的，
 * 要么是显式信任环境下客户端自述的，要么是匿名——不存在第四种。
 */
export function resolveActor(headers: Headers): Actor {
  const token = readSessionToken(headers);
  if (token) return verifyActorToken(token) ?? ANONYMOUS_ACTOR;

  if (!trustUnsignedActorHeaders()) return ANONYMOUS_ACTOR;

  const id = headers.get("x-actor-id");
  const name = headers.get("x-actor-name");
  const role = headers.get("x-actor-role");
  if (!id && !name && !role) return ANONYMOUS_ACTOR;
  return {
    id: id?.trim() || SYSTEM_ACTOR.id,
    name: name?.trim() || SYSTEM_ACTOR.name,
    role: role?.trim() || SYSTEM_ACTOR.role,
  };
}

/** 在请求作用域内设置 actor，执行完（含异步续体）自动恢复。 */
export function withActor<T>(actor: Actor, fn: () => T): T {
  return actorStorage.run(actor, fn);
}

/** service 层取当前 actor。无请求作用域时是 SYSTEM_ACTOR（后台自发动作）。 */
export function getActor(): Actor {
  return actorStorage.getStore() ?? SYSTEM_ACTOR;
}

/**
 * 旧测试套件在 afterEach 调用。AsyncLocalStorage 上下文随作用域自动结束，
 * 无全局可重置状态，保留为安全空操作以兼容既有测试。
 */
export function resetActor(): void {}
