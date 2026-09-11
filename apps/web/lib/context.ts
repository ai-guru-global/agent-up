/**
 * 请求级 actor 上下文。
 *
 * 当前阶段：从请求头 x-actor-id / x-actor-name / x-actor-role 解析，
 * 缺省回退到 "system"。这是一个**占位实现**——为将来接入 NextAuth 留好接口：
 * 届时只需把 resolveActor 改成读 session cookie / JWT，调用方零改动。
 *
 * 所有写操作（service 层）都应通过 getActor() 获取 actor，
 * 不再散落硬编码 "system"。
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface Actor {
  id: string;
  name: string;
  role: string;
}

const SYSTEM_ACTOR: Actor = {
  id: "system",
  name: "系统",
  role: "platform_admin",
};

// AsyncLocalStorage 让 actor 贯穿 await 之后的异步续体。
// 批1 起 route handler 闭包内是 async Prisma 调用，模块级同步栈会在
// 第一个 await 后丢上下文（审计署名错乱），故必须用 ALS。
const actorStorage = new AsyncLocalStorage<Actor>();

/** 从请求头解析 actor（缺省 system） */
export function resolveActor(headers: Headers): Actor {
  const id = headers.get("x-actor-id");
  const name = headers.get("x-actor-name");
  const role = headers.get("x-actor-role");
  if (!id && !name && !role) return SYSTEM_ACTOR;
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

/** service 层取当前 actor */
export function getActor(): Actor {
  return actorStorage.getStore() ?? SYSTEM_ACTOR;
}

/**
 * 旧测试套件在 afterEach 调用。AsyncLocalStorage 上下文随作用域自动结束，
 * 无全局可重置状态，保留为安全空操作以兼容既有测试。
 */
export function resetActor(): void {}
