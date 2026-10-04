import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password-hash";

/**
 * scrypt 口令哈希模块测试（纯 crypto，PG-free 可跑）。
 *
 * 批4（真实用户库登录）的落地顺序：本模块先行——它与「登录用 email 还是
 * username」「种子口令来源」等映射决策无关，可独立锁定行为；路由接线与
 * 种子写入等 PG 环境到位后提交。
 */

describe("hashPassword / verifyPassword 往返", () => {
  it("正确口令 → true", async () => {
    const stored = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", stored)).resolves.toBe(
      true,
    );
  });

  it("错误口令 → false（不抛错）", async () => {
    const stored = await hashPassword("right-password");
    await expect(verifyPassword("wrong-password", stored)).resolves.toBe(false);
  });

  it("随机盐：同一口令两次哈希产物不同，但都能校验通过", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    await expect(verifyPassword("same-password", a)).resolves.toBe(true);
    await expect(verifyPassword("same-password", b)).resolves.toBe(true);
  });

  it("Unicode 口令往返", async () => {
    const stored = await hashPassword("密码Password123！ 安全组");
    await expect(verifyPassword("密码Password123！ 安全组", stored)).resolves.toBe(true);
    await expect(verifyPassword("密码Password123！安全组", stored)).resolves.toBe(false);
  });

  it("存储串是自描述格式，可被解析出算法与成本参数", async () => {
    const stored = await hashPassword("x");
    const [algo, n, r, p] = stored.split("$");
    expect(algo).toBe("scrypt");
    expect(Number(n)).toBe(2 ** 16);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });
});

describe("verifyPassword 失败关闭：任何畸形输入返回 false 而非抛错", () => {
  it.each([
    [""],
    ["plaintext"],
    ["bcrypt$5$abc$def"],
    ["scrypt$1$8$1$c2FsdA$h"], // N 低于下界
    ["scrypt$2147483648$8$1$c2FsdA$h"], // N 恶意巨大（篡改库行的 DoS 路径）
    ["scrypt$65536$2$1$c2FsdA$h"], // r 低于下界
    ["scrypt$65536$8$0$c2FsdA$h"], // p=0
    ["scrypt$65536$8$1$short$hash"], // 盐/哈希段过短
    ["scrypt$65536$8$1$!!!not-base64!!!$hash"], // 非 base64
    ["scrypt$65536$8$1$c2FsdA$"], // 缺哈希段
  ])("畸形存储串 %j → false", async (bad) => {
    await expect(verifyPassword("pw", bad)).resolves.toBe(false);
  });

  it("哈希段被篡改一个字符 → false", async () => {
    const stored = await hashPassword("pw");
    const parts = stored.split("$");
    const hash = parts[5];
    const flipped = (hash[0] === "A" ? "B" : "A") + hash.slice(1);
    await expect(
      verifyPassword("pw", [...parts.slice(0, 5), flipped].join("$")),
    ).resolves.toBe(false);
  });

  it("段数超过 6 → false", async () => {
    const stored = await hashPassword("pw");
    await expect(verifyPassword("pw", `${stored}$extra`)).resolves.toBe(false);
  });
});
