// Centralized auth helpers for route handlers. Each helper returns
// either the resolved context object OR a NextResponse error to return
// directly. Callers do an `instanceof Response` check.
//
// Pattern (in a route):
//   const sess = await requireSession();
//   if (sess instanceof Response) return sess;
//   // ... use sess.user
//
// Or for manager-only routes:
//   const sess = await requireSession();
//   if (sess instanceof Response) return sess;
//   const mgr = await requireManager(sess, body.orgSlug);
//   if (mgr instanceof Response) return mgr;
//   // ... use mgr.org

import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export interface SessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
}

export interface SessionContext {
  user: SessionUser;
}

export async function requireSession(): Promise<SessionContext | NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return { user: session.user as SessionUser };
}

export type OrgRow = typeof schema.org.$inferSelect;

export interface ManagerContext {
  org: OrgRow;
  role: "manager";
}

/**
 * Verify the session user is a manager of `orgSlug`. Pass the
 * SessionContext from requireSession() — the type signature enforces
 * that `requireSession()` ran first, so `session.user.id` is always a
 * verified id (not a user-controlled body field).
 *
 * Returns:
 *   - 404 if the user has no membership in any org with that slug
 *   - 403 if the user is a member but role !== "manager"
 *   - { org, role } when authorized
 */
export async function requireManager(
  session: SessionContext,
  orgSlug: string,
): Promise<ManagerContext | NextResponse> {
  const [row] = await db
    .select({ org: schema.org, role: schema.membership.role })
    .from(schema.membership)
    .innerJoin(schema.org, eq(schema.membership.orgId, schema.org.id))
    .where(and(eq(schema.membership.userId, session.user.id), eq(schema.org.slug, orgSlug)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "not a member of this org" }, { status: 404 });
  }
  if (row.role !== "manager") {
    return NextResponse.json({ error: "not a manager of this org" }, { status: 403 });
  }
  return { org: row.org, role: "manager" };
}
