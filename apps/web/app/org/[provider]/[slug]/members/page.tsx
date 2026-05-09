import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { alias } from "drizzle-orm/pg-core";
import BackButton from "@/components/back-button";
import MembersClient from "./members-client";

export const dynamic = "force-dynamic";

export default async function MembersPage({ params }: { params: Promise<{ provider: string; slug: string }> }) {
  const { provider, slug } = await params;
  if (provider !== "github" && provider !== "gitlab") notFound();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/");

  const [callerRow] = await db
    .select({ org: schema.org, role: schema.membership.role })
    .from(schema.membership)
    .innerJoin(schema.org, eq(schema.membership.orgId, schema.org.id))
    .where(and(
      eq(schema.membership.userId, session.user.id),
      eq(schema.org.slug, slug),
      eq(schema.org.provider, provider),
    ))
    .limit(1);
  if (!callerRow) notFound();
  if (callerRow.role !== "manager") redirect(`/org/${provider}/${encodeURIComponent(slug)}`);

  const members = await db
    .select({
      userId: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      githubLogin: schema.user.githubLogin,
      image: schema.user.image,
      role: schema.membership.role,
      joinedAt: schema.membership.joinedAt,
    })
    .from(schema.membership)
    .innerJoin(schema.user, eq(schema.membership.userId, schema.user.id))
    .where(eq(schema.membership.orgId, callerRow.org.id));

  const actorUser = alias(schema.user, "actor_user");
  const targetUser = alias(schema.user, "target_user");
  const audit = await db
    .select({
      id: schema.membershipAudit.id,
      fromRole: schema.membershipAudit.fromRole,
      toRole: schema.membershipAudit.toRole,
      createdAt: schema.membershipAudit.createdAt,
      actorName: actorUser.name,
      actorLogin: actorUser.githubLogin,
      targetName: targetUser.name,
      targetLogin: targetUser.githubLogin,
    })
    .from(schema.membershipAudit)
    .innerJoin(actorUser, eq(schema.membershipAudit.actorUserId, actorUser.id))
    .innerJoin(targetUser, eq(schema.membershipAudit.targetUserId, targetUser.id))
    .where(eq(schema.membershipAudit.orgId, callerRow.org.id))
    .orderBy(desc(schema.membershipAudit.createdAt))
    .limit(50);

  const managerCount = members.filter(m => m.role === "manager").length;

  return (
    <main className="max-w-3xl mx-auto pt-20 sm:pt-24 px-4 sm:px-6 pb-16">
      <header className="flex items-start gap-3 sm:gap-4 mb-8 pb-5 border-b border-border">
        <BackButton href={`/org/${provider}/${encodeURIComponent(slug)}`} />
        <div className="min-w-0">
          <div className="mk-eyebrow mb-2">org · members</div>
          <h1 className="mk-heading text-2xl font-semibold tracking-[-0.02em] break-words">{callerRow.org.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">Promote a dev to manager, or demote a manager back to dev. You can't change your own role.</p>
        </div>
      </header>

      <MembersClient
        orgSlug={slug}
        currentUserId={session.user.id}
        managerCount={managerCount}
        members={members.map(m => ({
          userId: m.userId,
          name: m.name,
          login: m.githubLogin ?? null,
          image: m.image ?? null,
          role: m.role as "manager" | "dev",
          joinedAt: m.joinedAt.toISOString(),
        }))}
        audit={audit.map(a => ({
          id: a.id,
          fromRole: a.fromRole,
          toRole: a.toRole,
          createdAt: a.createdAt.toISOString(),
          actorName: a.actorName,
          actorLogin: a.actorLogin ?? null,
          targetName: a.targetName,
          targetLogin: a.targetLogin ?? null,
        }))}
      />
    </main>
  );
}
