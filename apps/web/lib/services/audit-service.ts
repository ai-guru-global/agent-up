import { store } from "@/lib/data/store";
import { getActor } from "@/lib/context";

/**
 * 审计日志服务（append-only）。
 *
 * 写入 data/settings/audit-logs.json（数组结构，与现有种子兼容）。
 * actor 从 request context 取，彻底替代此前散落硬编码的 "system"。
 *
 * 与 agent-service.recordConfigChange 的区别：
 * - recordConfigChange 写的是 data/config-changes/<id>.json（配置级 diff 明细）
 * - recordAudit 写的是 data/settings/audit-logs.json（全局行为审计流）
 * 两者互补：审计流回答「谁在何时做了什么」，配置 diff 回答「具体改了什么」。
 */

export interface AuditLogEntry {
  id: string;
  action: string;
  resource: string;
  resourceId: string;
  userName: string;
  userRole: string;
  createdAt: string;
  details?: Record<string, unknown>;
}

const AUDIT_FILE = ["settings", "audit-logs.json"] as const;

function readAll(): AuditLogEntry[] {
  return store.readArray<AuditLogEntry>(...AUDIT_FILE);
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
    id: store.generateId(),
    action,
    resource,
    resourceId,
    userName: actor.name,
    userRole: actor.role,
    createdAt: store.now(),
    ...(details ? { details } : {}),
  };

  try {
    const all = readAll();
    all.push(entry);
    store.writeArray(all, ...AUDIT_FILE);
  } catch (err) {
    // 审计失败不抛——业务已成功，不能因审计把请求变 500
    if (process.env.NODE_ENV !== "test") {
       
      console.error("[audit] recordAudit failed:", err);
    }
  }
  return entry;
}

/** 供 GET /api/settings/audit-logs 与测试使用 */
export function listAudit(filters?: {
  action?: string;
  resource?: string;
  resourceId?: string;
}): AuditLogEntry[] {
  let items = readAll();
  if (filters?.action) items = items.filter((i) => i.action === filters.action);
  if (filters?.resource)
    items = items.filter((i) => i.resource === filters.resource);
  if (filters?.resourceId)
    items = items.filter((i) => i.resourceId === filters.resourceId);
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
