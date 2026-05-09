"use server";

import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";

export async function disconnectOrg(input: { provider: "github" | "gitlab"; slug: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "unauthorized" };

  const [row] = await db
    .select({ orgId: schema.org.id, role: schema.membership.role })
    .from(schema.membership)
    .innerJoin(schema.org, eq(schema.membership.orgId, schema.org.id))
    .where(and(
      eq(schema.membership.userId, session.user.id),
      eq(schema.org.slug, input.slug),
      eq(schema.org.provider, input.provider),
    ))
    .limit(1);

  if (!row) return { ok: false, error: "org not found" };
  if (row.role !== "manager") return { ok: false, error: "only managers can disconnect" };

  await db.delete(schema.org).where(eq(schema.org.id, row.orgId));
  return { ok: true };
}
