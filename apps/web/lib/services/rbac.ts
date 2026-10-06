import { prisma } from "@agent-up/db";
import { getActor } from "@/lib/context";
import { AuthorizationError } from "@/lib/errors";

/**
 * RBAC 服务层强制（批③第二步）。
 *
 * 实现位置约束：只能在服务层 / resolveActor 一侧——middleware.ts 在静态
 * 导出模式（DEMO_EXPORT=1）下被 Next.js 禁用，别再去试。
 *
 * 解析链：actor.id → UserRole → Role → RolePermission → Permission，
 * 多角色取并集。令牌里的 role 字符串只是审计展示口径，**不作为授权依据**——
 * 授权唯一事实源是数据库里的角色-权限关系。
 *
 * 豁免：actor.id === "system"（进程内自发动作：后台重算、懒生成、审计等）。
 * 匿名/未知用户查不到 UserRole → 一律拒绝（失败关闭）。
 *
 * 口径：只强制「改变配置与记录归属」的写操作；chat / probe / 检索等
 * 动作型与读型端点保持开放（见 docs/reports 第四部分与 api-reference）。
 */
export async function requirePermission(
  resource: string,
  action: string,
): Promise<void> {
  const actor = getActor();
  if (actor.id === "system") return;

  const grants = await prisma.userRole.findMany({
    where: { userId: actor.id },
    include: {
      role: {
        include: { permissions: { include: { permission: true } } },
      },
    },
  });

  const allowed = grants.some((ur) =>
    ur.role.permissions.some(
      (rp) =>
        rp.permission.resource === resource &&
        rp.permission.action === action,
    ),
  );

  if (!allowed) {
    throw new AuthorizationError(`权限不足：需要 ${resource}:${action}`, {
      actorId: actor.id,
      required: `${resource}:${action}`,
    });
  }
}
