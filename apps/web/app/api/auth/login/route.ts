import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/utils";
import { signActorToken, sessionCookieValue } from "@/lib/auth-token";

// MOCK：硬编码演示凭据，未接入真实用户库；本地演示专用。
// 换真实用户库时只需替换这段校验，令牌签发与校验逻辑（lib/auth-token.ts）无需改动。
const VALID_USERNAME = "allengaller";
const VALID_PASSWORD = "123";

/** 演示账号对应的会话主体。role 与 SYSTEM_ACTOR 同级——这是 MOCK 单用户口径。 */
const DEMO_ACTOR = {
  id: "user-001",
  name: "Allen Galler",
  role: "platform_admin",
};

export async function POST(request: NextRequest) {
  const body = await parseBody<{ username: string; password: string }>(request);
  if (!body?.username || !body?.password) {
    return error("请填写用户名和密码");
  }

  if (body.username !== VALID_USERNAME || body.password !== VALID_PASSWORD) {
    return error("用户名或密码错误", 401);
  }

  const token = signActorToken(DEMO_ACTOR);
  if (!token && process.env.NODE_ENV !== "test") {
    // 没有 AUTH_SECRET 就发不出令牌，所有写操作会归因到「匿名」。
    // 静默降级最难排查，这里显式吼一声。
    console.error(
      "[auth] AUTH_SECRET 未配置，登录成功但无法签发会话令牌；" +
        "审计署名将落到 anonymous。生产环境必须配置 AUTH_SECRET。",
    );
  }

  const res = success({
    userId: DEMO_ACTOR.id,
    username: VALID_USERNAME,
    name: DEMO_ACTOR.name,
    /** 令牌是否真的签发成功，便于前端/运维识别「登录了但没会话」的错配 */
    sessionIssued: Boolean(token),
  });
  if (token) res.headers.set("Set-Cookie", sessionCookieValue(token));
  return res;
}
