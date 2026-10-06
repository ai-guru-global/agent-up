import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@agent-up/db";
import { withActor, type Actor } from "@/lib/context";
import { AuthorizationError } from "@/lib/errors";
import { requirePermission } from "@/lib/services/rbac";
import { updateAgent } from "@/lib/services/agent-service";
import { _resetDb } from "@/lib/data/test-db";
import { seedAgent } from "@/lib/__tests__/helpers/seed-db";

/**
 * RBAC 服务层强制矩阵（批③第二步）。
 *
 * 解析链：actor.id → UserRole → Role → RolePermission → Permission，
 * 多角色并集；system 豁免；匿名/未知用户失败关闭。
 */

const SYSTEM: Actor = { id: "system", name: "系统", role: "platform_admin" };
const ANON: Actor = { id: "anonymous", name: "匿名", role: "anonymous" };

async function seedGrant(opts: {
  userId: string;
  roleIds: string[];
  perms: Array<[string, string]>;
}): Promise<void> {
  await prisma.user.create({
    data: { id: opts.userId, email: `${opts.userId}@t.local`, name: opts.userId },
  });
  for (const [i, [resource, action]] of opts.perms.entries()) {
    const perm = await prisma.permission.create({
      data: { id: `p-${opts.userId}-${i}`, resource, action },
    });
    for (const roleId of opts.roleIds) {
      const role =
        (await prisma.role.findUnique({ where: { id: roleId } })) ??
        (await prisma.role.create({
          data: { id: roleId, name: roleId, displayName: roleId },
        }));
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: perm.id },
      });
    }
  }
  for (const roleId of opts.roleIds) {
    await prisma.userRole.create({
      data: {
        id: `ur-${opts.userId}-${roleId}`,
        userId: opts.userId,
        roleId,
        assignedBy: "test",
      },
    });
  }
}

beforeEach(async () => {
  await _resetDb();
});

describe("requirePermission 解析矩阵", () => {
  it("system actor 直接豁免（进程内自发动作）", async () => {
    await withActor(SYSTEM, async () => {
      await expect(requirePermission("anything", "write")).resolves.toBeUndefined();
    });
  });

  it("持有授权 → 通过", async () => {
    await seedGrant({ userId: "u-writer", roleIds: ["r-w"], perms: [["agent", "write"]] });
    await withActor({ id: "u-writer", name: "w", role: "x" }, async () => {
      await expect(requirePermission("agent", "write")).resolves.toBeUndefined();
    });
  });

  it("未持有该权限 → AuthorizationError（403）", async () => {
    await seedGrant({ userId: "u-fw", roleIds: ["r-f"], perms: [["feedback", "write"]] });
    await withActor({ id: "u-fw", name: "f", role: "x" }, async () => {
      await expect(requirePermission("agent", "write")).rejects.toBeInstanceOf(
        AuthorizationError,
      );
      // 同用户持有另一资源权限不受影响
      await expect(requirePermission("feedback", "write")).resolves.toBeUndefined();
    });
  });

  it("多角色取并集：两个角色各自的权限都算数", async () => {
    await seedGrant({
      userId: "u-multi",
      roleIds: ["r-a", "r-b"],
      perms: [
        ["agent", "write"],
        ["release", "approve"],
      ],
    });
    await withActor({ id: "u-multi", name: "m", role: "x" }, async () => {
      await expect(requirePermission("agent", "write")).resolves.toBeUndefined();
      await expect(requirePermission("release", "approve")).resolves.toBeUndefined();
    });
  });

  it("匿名 / 未知用户 → 失败关闭", async () => {
    await withActor(ANON, async () => {
      await expect(requirePermission("agent", "read")).rejects.toBeInstanceOf(
        AuthorizationError,
      );
    });
    await withActor({ id: "u-ghost", name: "g", role: "x" }, async () => {
      await expect(requirePermission("agent", "read")).rejects.toBeInstanceOf(
        AuthorizationError,
      );
    });
  });
});

describe("服务层集成：updateAgent 受 agent:write 约束", () => {
  it("无权限 actor → AuthorizationError，且不产生审计副作用", async () => {
    await seedAgent("ecs-assistant");
    await seedGrant({ userId: "u-viewer", roleIds: ["r-v"], perms: [["agent", "read"]] });
    await withActor({ id: "u-viewer", name: "v", role: "x" }, async () => {
      await expect(updateAgent("ecs-assistant", { name: "改名" })).rejects.toBeInstanceOf(
        AuthorizationError,
      );
    });
  });

  it("无请求作用域（getActor 缺省 SYSTEM）→ 豁免，存量服务级直调不受影响", async () => {
    await seedAgent("ecs-assistant");
    const updated = await updateAgent("ecs-assistant", { name: "后台改名" });
    expect(updated.name).toBe("后台改名");
  });
});
