import { success } from "@/lib/utils";
import { clearSessionCookieValue } from "@/lib/auth-token";

/**
 * 登出：清除会话 cookie。
 *
 * 刻意不校验令牌、不查库、总返回 200——登出必须幂等。令牌已过期或签名非法时，
 * 把它清掉同样是正确结果；若在这里返回 401，前端就会卡进「本地存着 cookie
 * 但服务端不认」的状态，用户既登不出也进不去。
 *
 * cookie 是 HttpOnly 的，客户端无法自行删除，所以这个端点是唯一的登出路径。
 */
export async function POST() {
  const res = success({ loggedOut: true });
  res.headers.set("Set-Cookie", clearSessionCookieValue());
  return res;
}
