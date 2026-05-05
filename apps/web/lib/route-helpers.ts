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
//   const mgr = await requireManager(sess.user.id, body.orgSlug);
//   if (mgr instanceof Response) return mgr;
//   // ... use mgr.org

import { auth } from "@/lib/auth";
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
