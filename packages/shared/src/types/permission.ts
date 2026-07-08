// 权限与角色类型
export enum RoleType {
  PLATFORM_ADMIN = "PLATFORM_ADMIN",
  PRODUCT_LEAD = "PRODUCT_LEAD",
  PRODUCT_MEMBER = "PRODUCT_MEMBER",
  SKILL_DEVELOPER = "SKILL_DEVELOPER",
  KNOWLEDGE_EDITOR = "KNOWLEDGE_EDITOR",
  AUDITOR = "AUDITOR",
  CRE_VIEWER = "CRE_VIEWER",
}

export enum PermissionAction {
  READ = "read",
  WRITE = "write",
  PUBLISH = "publish",
  APPROVE = "approve",
  ROLLBACK = "rollback",
  DELETE = "delete",
  ADMIN = "admin",
}

export enum PermissionScope {
  OWN_GROUP = "own_group",
  CROSS_GROUP = "cross_group",
  GLOBAL = "global",
}

export interface AuditLogEntry {
  action: string;
  resource: string;
  resourceId: string;
  userId: string;
  userName: string;
  userRole: string;
  details?: Record<string, unknown>;
}
