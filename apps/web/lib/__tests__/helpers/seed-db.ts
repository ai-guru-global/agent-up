import { prisma } from "@agent-up/db";

/**
 * 批1 PG 测试的最小种子（全局 db:seed 是批5 的活）。
 * id 沿用运行时种子命名，便于与 data/settings/*.json 对照。
 */
export async function seedSettings(): Promise<void> {
  await prisma.permission.createMany({
    data: [
      { id: "perm-1", resource: "agent", action: "read", description: "查看 Agent" },
      { id: "perm-2", resource: "agent", action: "write", description: "编辑 Agent" },
      { id: "perm-3", resource: "agent", action: "publish", description: "发布 Agent" },
      { id: "perm-4", resource: "release", action: "approve", description: "审批发布" },
      { id: "perm-5", resource: "settings", action: "admin", description: "系统设置管理" },
    ],
  });
  await prisma.role.createMany({
    data: [
      { id: "role-admin", name: "platform_admin", displayName: "平台管理员", isSystem: true, description: "拥有所有权限" },
      { id: "role-product", name: "product_member", displayName: "产品组成员", isSystem: true, description: "可编辑本产品组的 Agent 配置" },
      { id: "role-cre", name: "cre_viewer", displayName: "CRE 查看者", isSystem: true, description: "可查看反馈和提交改进建议" },
      { id: "role-custom", name: "custom_role", displayName: "自定义角色", isSystem: false },
    ],
  });
  await prisma.rolePermission.createMany({
    data: [
      { roleId: "role-admin", permissionId: "perm-1" },
      { roleId: "role-admin", permissionId: "perm-2" },
      { roleId: "role-admin", permissionId: "perm-3" },
      { roleId: "role-admin", permissionId: "perm-4" },
      { roleId: "role-admin", permissionId: "perm-5" },
      { roleId: "role-product", permissionId: "perm-1" },
      { roleId: "role-product", permissionId: "perm-2" },
      { roleId: "role-product", permissionId: "perm-3" },
      { roleId: "role-cre", permissionId: "perm-1" },
    ],
  });
  await prisma.user.createMany({
    data: [
      { id: "user-chen", email: "pm-chen@example.com", name: "陈产品" },
      { id: "user-wang", email: "cre-wang@example.com", name: "王客服" },
    ],
  });
  await prisma.userRole.createMany({
    data: [
      { id: "ur-1", userId: "user-chen", roleId: "role-admin", assignedBy: "seed" },
      { id: "ur-2", userId: "user-wang", roleId: "role-cre", assignedBy: "seed" },
    ],
  });
  await prisma.productGroup.createMany({
    data: [
      { id: "ecs-group", name: "ecs-group", displayName: "ECS 产品组", description: "ECS 云服务器产品线" },
      { id: "rds-group", name: "rds-group", displayName: "RDS 产品组", description: "RDS 云数据库产品线" },
    ],
  });
  await prisma.productGroupMember.createMany({
    data: [
      { id: "pgm-1", productGroupId: "ecs-group", userId: "user-chen" },
      { id: "pgm-2", productGroupId: "ecs-group", userId: "user-wang" },
    ],
  });
  await prisma.agent.create({
    data: { id: "ecs-assistant", name: "ECS 助手", productGroupId: "ecs-group", createdBy: "user-chen" },
  });
}

/** 批2 起 service 直测的最小 Agent 建档（产品组 + agent；勿与 seedSettings 的 ecs-assistant 同文件混用） */
export async function seedAgent(id = "ecs-assistant", name = "ECS 助手"): Promise<void> {
  await prisma.productGroup.create({
    data: { id: `${id}-group`, name: `${id}-group`, displayName: `${id} 产品组` },
  });
  await prisma.agent.create({
    data: { id, name, productGroupId: `${id}-group`, createdBy: "seed" },
  });
}

/** audit-logs 路由测试用审计夹具（绕过 recordAudit 直插，可精确控制 userId/createdAt） */
export async function seedAuditLogs(): Promise<void> {
  await prisma.auditLog.createMany({
    data: [
      { id: "log-001", action: "agent.update", resource: "agent", resourceId: "ecs-assistant", userName: "pm-chen", userRole: "product_member", userId: "user-chen", createdAt: new Date("2026-07-14T09:00:00.000Z"), details: { partition: "persona", changeNote: "调整人设" } },
      { id: "log-002", action: "role.create", resource: "role", resourceId: "role-custom", userName: "admin-li", userRole: "platform_admin", createdAt: new Date("2026-07-15T10:00:00.000Z") },
      { id: "log-003", action: "feedback.update", resource: "feedback", resourceId: "fb-001", userName: "wang-cre", userRole: "cre_viewer", userId: "user-wang", createdAt: new Date("2026-07-16T11:00:00.000Z") },
      { id: "log-004", action: "agent.update", resource: "agent", resourceId: "rds-assistant", userName: "pm-chen", userRole: "product_member", userId: "user-chen", createdAt: new Date("2026-07-17T12:00:00.000Z") },
    ],
  });
}
