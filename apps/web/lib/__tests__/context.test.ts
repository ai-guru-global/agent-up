import { describe, it, expect } from "vitest";
import { withActor, getActor, resolveActor } from "@/lib/context";

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

describe("resolveActor（请求头解析回归）", () => {
  it("完整请求头", () => {
    const headers = new Headers({
      "x-actor-id": "u-9",
      "x-actor-name": "wang-wu",
      "x-actor-role": "platform_admin",
    });
    expect(resolveActor(headers)).toEqual({ id: "u-9", name: "wang-wu", role: "platform_admin" });
  });

  it("空请求头回退 system", () => {
    expect(resolveActor(new Headers())).toEqual({ id: "system", name: "系统", role: "platform_admin" });
  });

  it("缺某一项时该字段回退 system 值", () => {
    const headers = new Headers({ "x-actor-name": "wang-wu" });
    expect(resolveActor(headers)).toEqual({ id: "system", name: "wang-wu", role: "platform_admin" });
  });
});
