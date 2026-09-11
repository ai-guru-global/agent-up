import { randomUUID } from "node:crypto";
import { prisma } from "@agent-up/db";
import { getActor } from "@/lib/context";

/**
 * 审计日志服务（append-only）。
 *
 * 与 agent-service.recordConfigChange 的区别：
 * - recordConfigChange 写配置级 diff 明细（批3 迁移）
 * - recordAudit 写全局行为审计流
 */

export interface AuditLogEntry {
  id: string;
  action: string;
  resource: string;
  resourceId: string;
  userName: string;
  userRole: string;
  createdAt: string;
  /** 批1 新增可空列：actor.id（"system" 或请求头值），仅作查询别名 */
  userId?: string | null;
  details?: Record<string, unknown>;
}

const pendingWrites = new Set<Promise<unknown>>();

function track<T>(p: Promise<T>): Promise<T> {
  pendingWrites.add(p);
  void p.finally(() => pendingWrites.delete(p));
  return p;
}

/** 测试专用：等待所有 fire-and-forget 审计写入收口 */
export async function flushAudit(): Promise<void> {
  await Promise.allSettled([...pendingWrites]);
}

/**
 * 记录一条审计日志。fire-and-forget 语义：不阻塞调用方，失败只记日志。
 * 因为审计失败不应让业务写操作回滚。
 */
export function recordAudit(
  action: string,
  resource: string,
  resourceId: string,
  details?: Record<string, unknown>,
): AuditLogEntry {
  const actor = getActor();
  const entry: AuditLogEntry = {
    id: randomUUID(),
    action,
    resource,
    resourceId,
    userName: actor.name,
    userRole: actor.role,
    userId: actor.id,
    createdAt: new Date().toISOString(),
    ...(details ? { details } : {}),
  };

  track(
    prisma.auditLog
      .create({
        data: {
          id: entry.id,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          userName: entry.userName,
          userRole: entry.userRole,
          userId: entry.userId ?? null,
          createdAt: new Date(entry.createdAt),
          details: (entry.details ?? undefined) as never,
        },
      })
      .catch((err) => {
        // 审计失败不抛——业务已成功，不能因审计把请求变 500
        if (process.env.NODE_ENV !== "test") {
          console.error("[audit] recordAudit failed:", err);
        }
      })
  );
  return entry;
}

/** 供 GET /api/settings/audit-logs 与测试使用 */
export async function listAudit(filters?: {
  action?: string;
  resource?: string;
  resourceId?: string;
  /** 匹配 userName 或 userId（后者的历史别名语义保留） */
  user?: string;
}): Promise<AuditLogEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      ...(filters?.action ? { action: filters.action } : {}),
      ...(filters?.resource ? { resource: filters.resource } : {}),
      ...(filters?.resourceId ? { resourceId: filters.resourceId } : {}),
      ...(filters?.user
        ? { OR: [{ userName: filters.user }, { userId: filters.user }] }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    resource: row.resource,
    resourceId: row.resourceId,
    userName: row.userName,
    userRole: row.userRole,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
    ...(row.details
      ? { details: row.details as Record<string, unknown> }
      : {}),
  }));
}
