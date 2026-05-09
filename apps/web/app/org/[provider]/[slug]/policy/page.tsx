import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import BackButton from "@/components/back-button";
import PolicyClient from "./policy-client";

export const dynamic = "force-dynamic";

export default async function PolicyPage({ params }: { params: Promise<{ provider: string; slug: string }> }) {
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
      githubLogin: schema.user.githubLogin,
      gitlabUsername: schema.user.gitlabUsername,
      role: schema.membership.role,
    })
    .from(schema.membership)
    .innerJoin(schema.user, eq(schema.membership.userId, schema.user.id))
    .where(eq(schema.membership.orgId, callerRow.org.id));

  return (
    <main className="max-w-4xl mx-auto pt-20 sm:pt-24 px-4 sm:px-6 pb-16">
      <header className="flex items-start gap-3 sm:gap-4 mb-8 pb-5 border-b border-border">
        <BackButton href={`/org/${provider}/${encodeURIComponent(slug)}`} />
        <div className="min-w-0">
          <div className="mk-eyebrow mb-2">org · policy</div>
          <h1 className="mk-heading text-2xl font-semibold tracking-[-0.02em] break-words">{callerRow.org.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage prompt retention and export reports by date range and team scope.</p>
        </div>
      </header>

      <PolicyClient
        provider={provider}
        slug={slug}
        retentionDays={callerRow.org.promptRetentionDays ?? 30}
        members={members.map((m) => ({
          userId: m.userId,
          name: m.name,
          login: provider === "gitlab" ? (m.gitlabUsername ?? null) : (m.githubLogin ?? null),
          role: m.role,
        }))}
      />
    </main>
  );
}
