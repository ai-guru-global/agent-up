/**
 * 口令哈希：node:crypto 内置 scrypt，零外部依赖。
 *
 * 为什么是 scrypt 而不是 argon2id：argon2id 需要原生依赖包（编译或预编译
 * 二进制），评审口径是避免重依赖；scrypt 同为内存困难型 KDF，是 OWASP
 * 口令存储清单在 argon2 之后的推荐项，对演示平台的威胁模型足够。
 *
 * 存储格式（自描述参数，留出将来上调成本的余地，老哈希无需迁移即可校验）：
 *   scrypt$<N>$<r>$<p>$<base64 salt>$<base64 hash>
 *
 * verify 对任何异常输入一律返回 false 而不是抛错——认证路径必须失败关闭；
 * 成本参数存在存储串里，校验前先做上界钳制，防止被篡改的库行
 * （例如 N=2^31）在登录时把进程内存打爆。
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** 签发成本：N=2^16 · r=8 · p=1 ≈ 64MB 内存，单次约 100-200ms，登录路径可接受 */
const N = 2 ** 16;
const R = 8;
const P = 1;
const KEYLEN = 32;
const SALT_LEN = 16;
/** 允许的最大 scrypt 内存（含余量）；超过会被 node 拒绝并由 verify 捕获为 false */
const MAXMEM = 512 * 1024 * 1024;

/** 校验时允许的成本参数范围：覆盖默认签发与将来合理上调，拦住显然恶意/损坏的值 */
function costParamsInBounds(n: number, r: number, p: number): boolean {
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p))
    return false;
  return n >= 2 ** 14 && n <= 2 ** 17 && r >= 8 && r <= 32 && p >= 1 && p <= 8;
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const derived = await scrypt(plain, salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (!costParamsInBounds(n, r, p)) return false;
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  // 8/16 字节下限：拦住被截断的存储串走完 KDF 后长度恰好相等这种巧合路径
  if (salt.length < 8 || expected.length < 16) return false;
  try {
    const actual = await scrypt(plain, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAXMEM,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    // 内存超限等 scrypt 拒绝一律视为校验失败，认证失败关闭
    return false;
  }
}
