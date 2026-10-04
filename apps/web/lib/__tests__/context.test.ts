import { describe, it, expect, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { withActor, getActor, resolveActor } from "@/lib/context";
import {
  signActorToken,
  verifyActorToken,
  SESSION_COOKIE,
  TOKEN_HEADER,
} from "@/lib/auth-token";

const alice = { id: "u-1", name: "张三", role: "product_member" };
const bob = { id: "u-2", name: "李四", role: "cre_viewer" };

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("getActor 缺省", () => {
  it("上下文外返回 system", () => {
    expect(getActor()).toEqual({ id: "system", name: "系统", role: "platform_admin" });
  });
});

describe("withActor 同步闭包（旧用法回归）", () => {
  it("闭包内生效，闭包外恢复", () => {
    const inside = withActor(alice, () => getActor().id);
    expect(inside).toBe("u-1");
    expect(getActor().id).toBe("system");
  });
});

describe("withActor 异步闭包（Prisma 改写的前提）", () => {
  it("await 之后 actor 仍生效", async () => {
    const name = await withActor(alice, async () => {
      await sleep(10);
      return getActor().name;
    });
    expect(name).toBe("张三");
  });

  it("并发请求互不串味", async () => {
    const [a, b] = await Promise.all([
      withActor(alice, async () => {
        await sleep(20);
        return getActor().id;
      }),
      withActor(bob, async () => {
        await sleep(5);
        return getActor().id;
      }),
    ]);
    expect(a).toBe("u-1");
    expect(b).toBe("u-2");
  });
});

describe("resolveActor（明文 x-actor-* 头，仅信任环境采纳）", () => {
  it("完整请求头", () => {
    const headers = new Headers({
      "x-actor-id": "u-9",
      "x-actor-name": "wang-wu",
      "x-actor-role": "platform_admin",
    });
    expect(resolveActor(headers)).toEqual({ id: "u-9", name: "wang-wu", role: "platform_admin" });
  });

  it("空请求头回退 anonymous（未认证 ≠ 超管）", () => {
    expect(resolveActor(new Headers())).toEqual({ id: "anonymous", name: "匿名", role: "anonymous" });
  });

  it("缺某一项时该字段回退 system 值", () => {
    const headers = new Headers({ "x-actor-name": "wang-wu" });
    expect(resolveActor(headers)).toEqual({ id: "system", name: "wang-wu", role: "platform_admin" });
  });
});

/** 临时改环境变量并保证还原，避免测试间串味 */
function withEnv(patch: Record<string, string | undefined>, fn: () => void) {
  const saved = Object.fromEntries(
    Object.keys(patch).map((k) => [k, process.env[k]]),
  );
  try {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const ANONYMOUS = { id: "anonymous", name: "匿名", role: "anonymous" };
const SECRET = "test-auth-secret";

afterEach(() => {
  delete process.env.AUTH_SECRET;
  delete process.env.AUTH_TRUST_ACTOR_HEADERS;
});

describe("resolveActor（签名令牌）", () => {
  it("cookie 里的有效令牌解析出 actor", () => {
    withEnv({ AUTH_SECRET: SECRET }, () => {
      const token = signActorToken({ id: "u-7", name: "赵六", role: "product_member" });
      expect(token).toBeTruthy();
      const headers = new Headers({ cookie: `other=1; ${SESSION_COOKIE}=${token}; more=2` });
      expect(resolveActor(headers)).toEqual({ id: "u-7", name: "赵六", role: "product_member" });
    });
  });

  it("x-actor-token 头优先于 cookie", () => {
    withEnv({ AUTH_SECRET: SECRET }, () => {
      const headerToken = signActorToken({ id: "u-head", name: "头", role: "cre_viewer" })!;
      const cookieToken = signActorToken({ id: "u-cookie", name: "饼", role: "cre_viewer" })!;
      const headers = new Headers({
        [TOKEN_HEADER]: headerToken,
        cookie: `${SESSION_COOKIE}=${cookieToken}`,
      });
      expect(resolveActor(headers).id).toBe("u-head");
    });
  });

  it("签名被篡改 → anonymous，且不回落到同时携带的明文头", () => {
    withEnv({ AUTH_SECRET: SECRET }, () => {
      const token = signActorToken({ id: "u-7", name: "赵六", role: "product_member" })!;
      const [prefix, body, sig] = token.split(".");
      const forged = `${prefix}.${body}.${sig.slice(0, -2)}aa`;
      const headers = new Headers({
        [TOKEN_HEADER]: forged,
        "x-actor-id": "attacker",
        "x-actor-role": "platform_admin",
      });
      expect(resolveActor(headers)).toEqual(ANONYMOUS);
    });
  });

  it("payload 被改写（提权）→ 签名失配 → anonymous", () => {
    withEnv({ AUTH_SECRET: SECRET }, () => {
      const token = signActorToken({ id: "u-7", name: "赵六", role: "cre_viewer" })!;
      const [prefix, , sig] = token.split(".");
      const escalated = Buffer.from(
        JSON.stringify({ id: "u-7", name: "赵六", role: "platform_admin", iat: 0, exp: 9999999999 }),
        "utf8",
      ).toString("base64url");
      const headers = new Headers({ [TOKEN_HEADER]: `${prefix}.${escalated}.${sig}` });
      expect(resolveActor(headers)).toEqual(ANONYMOUS);
    });
  });

  it("过期令牌 → anonymous", () => {
    withEnv({ AUTH_SECRET: SECRET }, () => {
      const now = Math.floor(Date.now() / 1000);
      const body = Buffer.from(
        JSON.stringify({ id: "u-7", name: "赵六", role: "product_member", iat: now - 100, exp: now - 10 }),
        "utf8",
      ).toString("base64url");
      const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
      expect(verifyActorToken(`v1.${body}.${sig}`)).toBeNull();
      expect(resolveActor(new Headers({ [TOKEN_HEADER]: `v1.${body}.${sig}` }))).toEqual(ANONYMOUS);
    });
  });

  it("未配置 AUTH_SECRET 时签不出令牌，任何令牌也验不过", () => {
    withEnv({ AUTH_SECRET: undefined }, () => {
      expect(signActorToken({ id: "u-7", name: "赵六", role: "product_member" })).toBeNull();
      expect(verifyActorToken("v1.aaa.bbb")).toBeNull();
      expect(resolveActor(new Headers({ [TOKEN_HEADER]: "v1.aaa.bbb" }))).toEqual(ANONYMOUS);
    });
  });

  it("换了密钥后旧令牌失效", () => {
    let token = "";
    withEnv({ AUTH_SECRET: SECRET }, () => {
      token = signActorToken({ id: "u-7", name: "赵六", role: "product_member" })!;
    });
    withEnv({ AUTH_SECRET: "rotated-secret" }, () => {
      expect(resolveActor(new Headers({ [TOKEN_HEADER]: token }))).toEqual(ANONYMOUS);
    });
  });
});

describe("resolveActor（明文头信任开关）", () => {
  it("production 默认不采纳明文头：伪造 platform_admin 无效", () => {
    withEnv({ NODE_ENV: "production", AUTH_TRUST_ACTOR_HEADERS: undefined }, () => {
      // Headers 值必须是 ByteString（Latin-1），非 ASCII 会在构造时抛 TypeError，
      // 因此伪造者的显示名用 ASCII；断言只看它是否被降级为 anonymous。
      const headers = new Headers({
        "x-actor-id": "attacker",
        "x-actor-name": "attacker",
        "x-actor-role": "platform_admin",
      });
      expect(resolveActor(headers)).toEqual(ANONYMOUS);
    });
  });

  it("AUTH_TRUST_ACTOR_HEADERS=1 时 production 也采纳（可信内网口径）", () => {
    withEnv({ NODE_ENV: "production", AUTH_TRUST_ACTOR_HEADERS: "1" }, () => {
      const headers = new Headers({ "x-actor-id": "cre-zhang", "x-actor-role": "cre_viewer" });
      expect(resolveActor(headers).id).toBe("cre-zhang");
    });
  });

  it("AUTH_TRUST_ACTOR_HEADERS=0 时非 production 也不采纳", () => {
    withEnv({ AUTH_TRUST_ACTOR_HEADERS: "0" }, () => {
      const headers = new Headers({ "x-actor-id": "u-9", "x-actor-role": "platform_admin" });
      expect(resolveActor(headers)).toEqual(ANONYMOUS);
    });
  });

  it("不信任明文头时，有效令牌仍然可用", () => {
    withEnv({ NODE_ENV: "production", AUTH_SECRET: SECRET }, () => {
      const token = signActorToken({ id: "u-7", name: "赵六", role: "cre_viewer" })!;
      expect(resolveActor(new Headers({ [TOKEN_HEADER]: token }))).toEqual({
        id: "u-7",
        name: "赵六",
        role: "cre_viewer",
      });
    });
  });
});
