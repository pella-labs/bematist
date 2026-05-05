// Audit log helper. Never throws — a failure to log must not break the parent
// request. Read in tandem with apps/web/lib/db/schema.ts (auditLog table).

import { db, schema } from "@/lib/db";

export type AuditAction =
  | "role.change"
  | "invite.send"
  | "token.create";

export interface AuditEvent {
  orgId?: string | null;
  actorUserId?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Extract caller IP and User-Agent from a Request. Railway sets
 * `x-forwarded-for` (first hop = the real client). We also accept
 * `x-real-ip` as a fallback for non-Railway deployments.
 */
export function extractRequestMeta(req: Request): RequestMeta {
  const xff = req.headers.get("x-forwarded-for");
  let ip: string | null = null;
  if (xff) {
    ip = xff.split(",")[0]!.trim() || null;
  } else {
    ip = req.headers.get("x-real-ip");
  }
  const userAgent = req.headers.get("user-agent");
  return { ip, userAgent };
}

/**
 * Insert one audit_log row. Best-effort: a logging failure logs to
 * console.error and resolves — it never throws. Reason: a logging
 * outage must not 500 a user request.
 */
export async function logAudit(event: AuditEvent): Promise<void> {
  try {
    await db.insert(schema.auditLog).values({
      orgId: event.orgId ?? null,
      actorUserId: event.actorUserId ?? null,
      action: event.action,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      metadata: event.metadata ?? {},
      ip: event.ip ?? null,
      userAgent: event.userAgent ?? null,
    });
  } catch (err) {
    console.error("logAudit failed", { action: event.action, err });
  }
}
