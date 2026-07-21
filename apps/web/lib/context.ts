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

// 同步 AsyncLocalStorage 太重，这里用一个简单的「当前请求 actor」栈即可。
// Next.js Route Handler 是单线程串行处理一次请求的，模块级栈足够。
let currentActor: Actor = SYSTEM_ACTOR;

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

/** 在请求作用域内设置 actor，执行完恢复。供 route handler 包裹 service 调用。 */
export function withActor<T>(actor: Actor, fn: () => T): T {
  const prev = currentActor;
  currentActor = actor;
  try {
    return fn();
  } finally {
    currentActor = prev;
  }
}

/** service 层取当前 actor */
export function getActor(): Actor {
  return currentActor;
}

/** 测试用：重置回 system */
export function resetActor(): void {
  currentActor = SYSTEM_ACTOR;
}
