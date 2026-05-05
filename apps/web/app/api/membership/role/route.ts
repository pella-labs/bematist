// POST /api/membership/role  { orgSlug, targetUserId, role: "manager" | "dev" }
// Manager-only. Cannot demote yourself. Cannot demote the last remaining manager.

import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireManager } from "@/lib/route-helpers";
import { logAudit, extractRequestMeta } from "@/lib/audit";

const bodySchema = z.object({
  orgSlug: z.string(),
  targetUserId: z.string().min(1),
  role: z.enum(["manager", "dev"]),
});

export async function POST(req: Request) {
  const sess = await requireSession();
  if (sess instanceof Response) return sess;

  const body = bodySchema.parse(await req.json());

  const mgr = await requireManager(sess, body.orgSlug);
  if (mgr instanceof Response) return mgr;

  if (sess.user.id === body.targetUserId) {
    return NextResponse.json({ error: "you can't change your own role" }, { status: 400 });
  }

  const [target] = await db.select().from(schema.membership)
    .where(and(eq(schema.membership.userId, body.targetUserId), eq(schema.membership.orgId, mgr.org.id)))
    .limit(1);
  if (!target) return NextResponse.json({ error: "target is not a member of this org" }, { status: 404 });

  if (target.role === body.role) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  if (target.role === "manager" && body.role === "dev") {
    const managers = await db.select({ userId: schema.membership.userId })
      .from(schema.membership)
      .where(and(eq(schema.membership.orgId, mgr.org.id), eq(schema.membership.role, "manager")));
    if (managers.length <= 1) {
      return NextResponse.json({ error: "can't demote the last manager" }, { status: 400 });
    }
  }

  await db.update(schema.membership)
    .set({ role: body.role })
    .where(and(eq(schema.membership.userId, body.targetUserId), eq(schema.membership.orgId, mgr.org.id)));

  // Keep writing to membership_audit so /org/[slug]/members continues to render
  // role-change history without a separate UI change. A follow-up plan migrates
  // that page to read from audit_log and we can drop this dual-write.
  // Wrapped in try/catch matching logAudit's swallow-on-failure semantics: a
  // legacy-audit hiccup must not 500 a request whose role mutation already
  // succeeded.
  try {
    await db.insert(schema.membershipAudit).values({
      orgId: mgr.org.id,
      targetUserId: body.targetUserId,
      actorUserId: sess.user.id,
      fromRole: target.role,
      toRole: body.role,
    });
  } catch (err) {
    console.error("membership_audit insert failed", { orgId: mgr.org.id, targetUserId: body.targetUserId, err });
  }

  const meta = extractRequestMeta(req);
  await logAudit({
    orgId: mgr.org.id,
    actorUserId: sess.user.id,
    action: "role.change",
    targetType: "membership",
    targetId: body.targetUserId,
    metadata: { fromRole: target.role, toRole: body.role },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true });
}
