import { prisma } from "@agent-up/db";

/**
 * 批1 PG 测试的最小种子（全局 db:seed 是批5 的活）。
 * id 沿用全局种子（packages/db/prisma/seed-data.mjs）命名，便于对照。
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

export interface SeedVersionInput {
  agentId: string;
  /** AgentVersion id，如 "ver-001" */
  versionId: string;
  /** SemVer 字符串，如 "0.1.0" */
  version: string;
  publishedAt?: Date;
  changeNote?: string;
  snapshots?: {
    prompt?: Record<string, unknown>;
    knowledge?: Record<string, unknown>;
    tools?: Record<string, unknown>;
    routing?: Record<string, unknown>;
  };
  releaseId?: string;
  releaseStatus?: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
}

/**
 * 批4 起版本表事实源在 PG：AgentVersion.releaseId 是必填 FK，
 * 夹具先建 Release 行再建 AgentVersion 行。发布链路测试统一用它。
 */
export async function seedReleaseWithVersion(input: SeedVersionInput): Promise<void> {
  const releaseId = input.releaseId ?? `rel-${input.versionId}`;
  const publishedAt = input.publishedAt ?? new Date("2026-09-01T00:00:00.000Z");
  const [major, minor, patch] = input.version.split(".").map(Number);
  await prisma.release.create({
    data: {
      id: releaseId,
      agentId: input.agentId,
      changeNote: input.changeNote ?? "seed release",
      changedPartitions: JSON.stringify(["PROMPT"]),
      status: input.releaseStatus ?? "APPROVED",
      submittedBy: "seed",
      submittedAt: publishedAt,
      approvedBy: "seed",
      approvedAt: publishedAt,
    },
  });
  await prisma.agentVersion.create({
    data: {
      id: input.versionId,
      agentId: input.agentId,
      version: input.version,
      major: major ?? 0,
      minor: minor ?? 0,
      patch: patch ?? 0,
      promptSnapshot: JSON.stringify(input.snapshots?.prompt ?? {}),
      knowledgeSnapshot: JSON.stringify(input.snapshots?.knowledge ?? {}),
      toolsSnapshot: JSON.stringify(input.snapshots?.tools ?? {}),
      routingSnapshot: JSON.stringify(input.snapshots?.routing ?? {}),
      releaseId,
      publishedBy: "seed",
      publishedAt,
      changeNote: input.changeNote ?? "seed release",
    },
  });
}

/** audit-logs 路由测试用审计夹具（绕过 recordAudit 直插，可精确控制 userId/createdAt） */
export async function seedAuditLogs(): Promise<void> {
  await prisma.auditLog.createMany({
    data: [
      { id: "log-001", action: "agent.update", resource: "agent", resourceId: "ecs-assistant", userName: "pm-chen", userRole: "product_member", userId: "user-chen", createdAt: new Date("2026-07-14T09:00:00.000Z"), details: JSON.stringify({ partition: "persona", changeNote: "调整人设" }) },
      { id: "log-002", action: "role.create", resource: "role", resourceId: "role-custom", userName: "admin-li", userRole: "platform_admin", createdAt: new Date("2026-07-15T10:00:00.000Z") },
      { id: "log-003", action: "feedback.update", resource: "feedback", resourceId: "fb-001", userName: "wang-cre", userRole: "cre_viewer", userId: "user-wang", createdAt: new Date("2026-07-16T11:00:00.000Z") },
      { id: "log-004", action: "agent.update", resource: "agent", resourceId: "rds-assistant", userName: "pm-chen", userRole: "product_member", userId: "user-chen", createdAt: new Date("2026-07-17T12:00:00.000Z") },
    ],
  });
}

// ============================================================
// 批③ RBAC 测试夹具：种子角色/权限 + 持全权限的管理员用户
// ============================================================

/** RBAC 测试管理员用户 id（经 x-actor-id 信任头传给路由） */
export const RBAC_ADMIN_ID = "user-rbac-admin";

/** 写路由测试通用请求头（测试环境信任 x-actor-*，RBAC 按此 id 查库解析权限） */
export const adminActorHeaders: Record<string, string> = {
  "x-actor-id": RBAC_ADMIN_ID,
  "x-actor-name": "Admin",
  "x-actor-role": "platform_admin",
};

/** 种子全套权限 + 管理员角色 + 绑定用户（幂等；在 _resetDb 之后调用） */
export async function seedRbacAdmin(): Promise<void> {
  const perms = [
    ["agent", "read"],
    ["agent", "write"],
    ["agent", "publish"],
    ["release", "approve"],
    ["settings", "admin"],
    ["feedback", "read"],
    ["feedback", "write"],
    ["wiki", "read"],
    ["wiki", "write"],
    ["audit", "read"],
  ] as const;
  for (const [resource, action] of perms) {
    await prisma.permission.upsert({
      where: { resource_action: { resource, action } },
      create: { id: `perm-t-${resource}-${action}`, resource, action },
      update: {},
    });
  }
  const role = await prisma.role.upsert({
    where: { id: "role-t-admin" },
    create: {
      id: "role-t-admin",
      name: "rbac_test_admin",
      displayName: "测试管理员",
      isSystem: true,
    },
    update: {},
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  const all = await prisma.permission.findMany();
  await prisma.rolePermission.createMany({
    data: all.map((p) => ({ roleId: role.id, permissionId: p.id })),
  });
  await prisma.user.upsert({
    where: { id: RBAC_ADMIN_ID },
    create: { id: RBAC_ADMIN_ID, email: "rbac-admin@test.local", name: "Admin" },
    update: {},
  });
  await prisma.userRole.upsert({
    where: { id: "ur-t-rbac-admin" },
    create: { id: "ur-t-rbac-admin", userId: RBAC_ADMIN_ID, roleId: role.id, assignedBy: "test" },
    update: {},
  });
}
