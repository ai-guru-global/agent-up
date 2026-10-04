import { describe, it, expect, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  signActorToken,
  verifyActorToken,
  readSessionToken,
  sessionCookieValue,
  SESSION_COOKIE,
  TOKEN_HEADER,
} from "@/lib/auth-token";

const SECRET = "test-auth-secret";

/** 临时改写 process.env 并在结束后精确还原（undefined 表示删除该键）。 */
function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(patch)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/**
 * 用当前密钥对任意 body 签名，拼出「签名有效但载荷非法」的令牌。
 * 版本前缀从真实令牌里取，避免在测试里硬编码 "v1" 与实现脱钩。
 */
function forge(bodyText: string): string {
  const prefix = withEnv({ AUTH_SECRET: SECRET }, () =>
    signActorToken({ id: "u", name: "n", role: "r" }),
  )!.split(".")[0];
  const body = Buffer.from(bodyText, "utf8").toString("base64url");
  const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${prefix}.${body}.${sig}`;
}

afterEach(() => {
  delete process.env.AUTH_SECRET;
  delete process.env.AUTH_TRUST_ACTOR_HEADERS;
});

describe("verifyActorToken 载荷校验（签名有效也必须查载荷）", () => {
  it("body 不是合法 JSON → null", () => {
    withEnv({ AUTH_SECRET: SECRET }, () => {
      expect(verifyActorToken(forge("not-json-at-all"))).toBeNull();
    });
  });

  it("body 是 JSON 但不是对象（数组）→ null", () => {
    withEnv({ AUTH_SECRET: SECRET }, () => {
      expect(verifyActorToken(forge("[1,2,3]"))).toBeNull();
    });
  });

  it("body 是 JSON null → null", () => {
    withEnv({ AUTH_SECRET: SECRET }, () => {
      expect(verifyActorToken(forge("null"))).toBeNull();
    });
  });

  it.each(["id", "name", "role"])("缺 %s 字段 → null", (field) => {
    withEnv({ AUTH_SECRET: SECRET }, () => {
      const payload: Record<string, unknown> = {
        id: "u-1",
        name: "n",
        role: "r",
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      delete payload[field];
      expect(verifyActorToken(forge(JSON.stringify(payload)))).toBeNull();
    });
  });

  it.each(["id", "name", "role"])("%s 为空串 → null", (field) => {
    withEnv({ AUTH_SECRET: SECRET }, () => {
      const payload = {
        id: "u-1",
        name: "n",
        role: "r",
        exp: Math.floor(Date.now() / 1000) + 3600,
        [field]: "",
      };
      expect(verifyActorToken(forge(JSON.stringify(payload)))).toBeNull();
    });
  });

  it("字段类型不对（id 为数字）→ null", () => {
    withEnv({ AUTH_SECRET: SECRET }, () => {
      const payload = { id: 123, name: "n", role: "r", exp: Math.floor(Date.now() / 1000) + 3600 };
      expect(verifyActorToken(forge(JSON.stringify(payload)))).toBeNull();
    });
  });
});

describe("readSessionToken 取值优先级与容错", () => {
  it("cookie 头里没有会话 cookie → null", () => {
    const headers = new Headers({ cookie: "theme=dark; locale=zh-CN" });
    expect(readSessionToken(headers)).toBeNull();
  });

  it("cookie 值为空 → 不当作令牌", () => {
    const headers = new Headers({ cookie: `${SESSION_COOKIE}=; theme=dark` });
    expect(readSessionToken(headers)).toBeNull();
  });

  it("cookie 片段没有等号时跳过而不抛错", () => {
    const headers = new Headers({ cookie: `malformed; ${SESSION_COOKIE}=tok-1` });
    expect(readSessionToken(headers)).toBe("tok-1");
  });

  it("显式头只有空白时回落到 cookie", () => {
    const headers = new Headers({ cookie: `${SESSION_COOKIE}=tok-cookie` });
    headers.set(TOKEN_HEADER, "   ");
    expect(readSessionToken(headers)).toBe("tok-cookie");
  });

  it("两者都没有 → null", () => {
    expect(readSessionToken(new Headers())).toBeNull();
  });
});

describe("sessionCookieValue 属性", () => {
  it("非 production 不带 Secure（本地 http 下带了浏览器会丢弃）", () => {
    withEnv({ NODE_ENV: "test", AUTH_SECRET: SECRET }, () => {
      const value = sessionCookieValue("tok-1");
      expect(value).toContain(`${SESSION_COOKIE}=tok-1`);
      expect(value).toContain("HttpOnly");
      expect(value).toContain("SameSite=Lax");
      expect(value).toContain("Path=/");
      expect(value).not.toContain("Secure");
    });
  });

  it("production 追加 Secure", () => {
    withEnv({ NODE_ENV: "production", AUTH_SECRET: SECRET }, () => {
      expect(sessionCookieValue("tok-1")).toContain("; Secure");
    });
  });

  it("Max-Age 跟随 AUTH_SESSION_TTL_HOURS", () => {
    withEnv({ AUTH_SECRET: SECRET, AUTH_SESSION_TTL_HOURS: "2" }, () => {
      expect(sessionCookieValue("tok-1")).toContain(`Max-Age=${2 * 3600}`);
    });
  });

  it("TTL 非法值回落到默认 24 小时", () => {
    withEnv({ AUTH_SECRET: SECRET, AUTH_SESSION_TTL_HOURS: "abc" }, () => {
      expect(sessionCookieValue("tok-1")).toContain(`Max-Age=${24 * 3600}`);
    });
  });

  it("签出的 cookie 能被 readSessionToken 原样读回并校验通过", () => {
    withEnv({ AUTH_SECRET: SECRET }, () => {
      const token = signActorToken({ id: "u-1", name: "张三", role: "cre_viewer" })!;
      // 取 Set-Cookie 的键值对部分（丢掉 Path/HttpOnly 等属性）塞进 cookie 头
      const pair = sessionCookieValue(token).split(";")[0];
      expect(verifyActorToken(readSessionToken(new Headers({ cookie: pair }))!)).toEqual({
        id: "u-1",
        name: "张三",
        role: "cre_viewer",
      });
    });
  });
});
