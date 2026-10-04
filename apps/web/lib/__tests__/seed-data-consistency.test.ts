import { describe, expect, it } from "vitest";
import {
  permissions,
  roles,
  userRoles,
  users,
  wikiPages,
  wikiVaults,
} from "@agent-up/db/prisma/seed-data.mjs";

/**
 * 种子数据一致性守卫（纯静态断言，PG-free 可跑）。
 *
 * seed-data.mjs 是双轨单一事实源：db:seed 展平写入 PostgreSQL，
 * demo/seed.ts 原样喂给浏览器演示态。其中的 _count 是 JSON 文件时代
 * 手工维护的冗余计数，曾与实际关系数组脱节——perm-6..10 声称被
 * 3/2/3/2/1 个角色持有、实际授权为零；role-product/role-cre 的
 * _count.members 声称 5/8、userRoles 实为 2/3。真实轨的 _count 由
 * Prisma 关系计数现算，永不撒谎；演示轨却把假数字直接渲染给用户。
 *
 * 本文件把「冗余计数必须等于从关系数组现算的值」固化为断言，
 * 今后手工增删种子关系时改漏 _count 会直接挂测试。
 */

type AnyRec = Record<string, unknown>;

const grantedRoleCount = (permId: string): number =>
  (roles as AnyRec[]).filter((role) =>
    ((role.permissions as AnyRec[]) ?? []).some(
      (entry) => (entry.permission as AnyRec).id === permId,
    ),
  ).length;

const memberCount = (roleId: string): number =>
  (userRoles as AnyRec[]).filter((ur) => ur.roleId === roleId).length;

describe("permissions._count.roles 必须等于实际授权该权限的角色数", () => {
  it("全部 10 个权限逐一核对（perm-6..10 曾声称 3/2/3/2/1、实际为 0）", () => {
    for (const perm of permissions as AnyRec[]) {
      expect(
        grantedRoleCount(perm.id as string),
        `${perm.id}(${perm.resource}:${perm.action}) 的 _count.roles 与实际授权角色数不符`,
      ).toBe((perm._count as AnyRec).roles);
    }
  });

  it("权限非空且 id 唯一", () => {
    expect(permissions.length).toBeGreaterThan(0);
    const ids = (permissions as AnyRec[]).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("roles._count.members 必须等于 userRoles 里该角色的行数", () => {
  it("全部角色逐一核对（role-product/role-cre 曾声称 5/8、实为 2/3）", () => {
    for (const role of roles as AnyRec[]) {
      expect(
        memberCount(role.id as string),
        `${role.id}(${role.name}) 的 _count.members 与 userRoles 实际行数不符`,
      ).toBe((role._count as AnyRec).members);
    }
  });
});

describe("关系数组的引用完整性", () => {
  const permIds = new Set((permissions as AnyRec[]).map((p) => p.id));
  const roleIds = new Set((roles as AnyRec[]).map((r) => r.id));
  const userIds = new Set((users as AnyRec[]).map((u) => u.id));
  const vaultIds = new Set((wikiVaults as AnyRec[]).map((v) => v.id));

  it("角色内嵌的每条 permission 引用都指向存在的权限，且嵌套字段与权限表一致", () => {
    for (const role of roles as AnyRec[]) {
      for (const entry of (role.permissions as AnyRec[]) ?? []) {
        const perm = entry.permission as AnyRec;
        expect(permIds.has(perm.id as string)).toBe(true);
        const canonical = (permissions as AnyRec[]).find(
          (p) => p.id === perm.id,
        )!;
        expect(perm.resource).toBe(canonical.resource);
        expect(perm.action).toBe(canonical.action);
      }
    }
  });

  it("userRoles 的 userId / roleId 都指向存在的记录", () => {
    for (const ur of userRoles as AnyRec[]) {
      expect(userIds.has(ur.userId as string)).toBe(true);
      expect(roleIds.has(ur.roleId as string)).toBe(true);
    }
  });

  it("wikiPages.vaultId 都指向存在的 vault（悬空会使演示轨页面静默丢失）", () => {
    for (const p of wikiPages as AnyRec[]) {
      expect(vaultIds.has(p.vaultId as string)).toBe(true);
    }
  });
});
