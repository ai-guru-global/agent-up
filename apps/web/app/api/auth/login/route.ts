import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/utils";

// MOCK：硬编码演示凭据，未接入真实认证（NextAuth 预留位）；本地演示专用
const VALID_USERNAME = "allengaller";
const VALID_PASSWORD = "123";

export async function POST(request: NextRequest) {
  const body = await parseBody<{ username: string; password: string }>(request);
  if (!body?.username || !body?.password) {
    return error("请填写用户名和密码");
  }

  if (body.username !== VALID_USERNAME || body.password !== VALID_PASSWORD) {
    return error("用户名或密码错误", 401);
  }

  return success({
    userId: "user-001",
    username: VALID_USERNAME,
    name: "Allen Galler",
  });
}
