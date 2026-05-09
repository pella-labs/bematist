"use server";

import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, eq, sql } from "drizzle-orm";
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

export async function updatePromptRetention(input: {
  provider: "github" | "gitlab";
  slug: string;
  retentionDays: number;
}): Promise<
  | { ok: true; retentionDays: number; promptRetentionUpdatedAt: string }
  | { ok: false; error: string; code?: "cooldown"; retryAt?: string }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "unauthorized" };

  const retentionDays = Math.min(365, Math.max(7, Math.trunc(input.retentionDays)));

  const [row] = await db
    .select({
      orgId: schema.org.id,
      role: schema.membership.role,
      promptRetentionUpdatedAt: schema.org.promptRetentionUpdatedAt,
    })
    .from(schema.membership)
    .innerJoin(schema.org, eq(schema.membership.orgId, schema.org.id))
    .where(and(
      eq(schema.membership.userId, session.user.id),
      eq(schema.org.slug, input.slug),
      eq(schema.org.provider, input.provider),
    ))
    .limit(1);

  if (!row) return { ok: false, error: "org not found" };
  if (row.role !== "manager") return { ok: false, error: "only managers can change retention" };

  const now = Date.now();
  const last = row.promptRetentionUpdatedAt?.getTime?.() ?? 0;
  const cooldownMs = 24 * 60 * 60 * 1000;
  if (last > 0 && now - last < cooldownMs) {
    const retryAt = new Date(last + cooldownMs).toISOString();
    return {
      ok: false,
      code: "cooldown",
      retryAt,
      error: "Prompt retention can only be changed once every 24 hours.",
    };
  }

  const updatedAt = new Date();
  await db.update(schema.org)
    .set({ promptRetentionDays: retentionDays, promptRetentionUpdatedAt: updatedAt })
    .where(eq(schema.org.id, row.orgId));

  await db.execute(sql`
    update prompt_event
    set expires_at = created_at + (${retentionDays} || ' days')::interval
    where org_id = ${row.orgId}
  `);
  await db.execute(sql`
    update response_event
    set expires_at = created_at + (${retentionDays} || ' days')::interval
    where org_id = ${row.orgId}
  `);

  return { ok: true, retentionDays, promptRetentionUpdatedAt: updatedAt.toISOString() };
}
