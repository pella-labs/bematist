// POST /api/invite     { orgSlug, githubLogin }  — manager only
// GET  /api/invite     ?orgSlug=... — list pending invites in org

import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appFetch, appConfigured, installUrl } from "@/lib/github-app";
import { requireSession, requireManager } from "@/lib/route-helpers";
import { logAudit, extractRequestMeta } from "@/lib/audit";

export async function GET(req: Request) {
  const sess = await requireSession();
  if (sess instanceof Response) return sess;

  const { searchParams } = new URL(req.url);
  const orgSlug = searchParams.get("orgSlug");
  if (!orgSlug) return NextResponse.json({ error: "orgSlug required" }, { status: 400 });

  const mgr = await requireManager(sess, orgSlug);
  if (mgr instanceof Response) return mgr;

  const invites = await db.select().from(schema.invitation).where(eq(schema.invitation.orgId, mgr.org.id));
  return NextResponse.json({ invites });
}

const inviteSchema = z.object({
  orgSlug: z.string(),
  githubLogin: z.string().min(1),
  role: z.enum(["manager", "dev"]).default("dev"),
});

export async function POST(req: Request) {
  const sess = await requireSession();
  if (sess instanceof Response) return sess;

  const body = inviteSchema.parse(await req.json());

  const mgr = await requireManager(sess, body.orgSlug);
  if (mgr instanceof Response) return mgr;

  // Verify invitee is actually in the GitHub org
  const [acc] = await db.select().from(schema.account)
    .where(and(eq(schema.account.userId, sess.user.id), eq(schema.account.providerId, "github")))
    .limit(1);
  if (!acc?.accessToken) return NextResponse.json({ error: "no github token" }, { status: 400 });

  const useApp = appConfigured() && mgr.org.githubAppInstallationId != null;
  const installationId = mgr.org.githubAppInstallationId as number | null;
  const typedInput = body.githubLogin.trim();

  // Look up the canonical login spelling (GitHub usernames are case-insensitive
  // at lookup; using the response value avoids inviting a typo'd account).
  const userRes = useApp
    ? await appFetch(installationId!, `/users/${typedInput}`)
    : await fetch(`https://api.github.com/users/${typedInput}`, {
        headers: { Authorization: `Bearer ${acc.accessToken}`, Accept: "application/vnd.github+json" },
      });
  if (!userRes.ok) {
    return NextResponse.json({ error: `${typedInput} is not a valid GitHub user` }, { status: 400 });
  }
  const ghUser = await userRes.json() as { login: string; id: number; type?: string };
  const login = ghUser.login;

  // Public-member check: 204 = member.
  const pub = useApp
    ? await appFetch(installationId!, `/orgs/${mgr.org.slug}/members/${login}`, { redirect: "manual" })
    : await fetch(`https://api.github.com/orgs/${mgr.org.slug}/members/${login}`, {
        headers: { Authorization: `Bearer ${acc.accessToken}`, Accept: "application/vnd.github+json" },
        redirect: "manual",
      });
  const alreadyMember = pub.status === 204;

  let github:
    | { ok: true; status: "already_member" | "invited" | "active"; via: "app" | "user" }
    | { ok: false; error: string; install_url?: string }
    | null = null;

  if (alreadyMember) {
    github = { ok: true, status: "already_member", via: useApp ? "app" : "user" };
  } else if (useApp) {
    const inviteRes = await appFetch(installationId!, `/orgs/${mgr.org.slug}/memberships/${login}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "member" }),
    });
    if (inviteRes.ok) {
      const data = await inviteRes.json().catch(() => ({} as any));
      github = { ok: true, status: data?.state === "active" ? "active" : "invited", via: "app" };
    } else {
      const data = await inviteRes.json().catch(() => ({} as any));
      github = { ok: false, error: data?.message ?? `GitHub invite failed (${inviteRes.status})` };
    }
  } else {
    const url = installUrl(mgr.org.slug);
    github = {
      ok: false,
      error: url
        ? "Install Pellametric on this GitHub org to enable invites."
        : "GitHub invites are not configured on this server.",
      ...(url ? { install_url: url } : {}),
    };
  }

  const [inv] = await db.insert(schema.invitation).values({
    orgId: mgr.org.id,
    githubLogin: login,
    invitedByUserId: sess.user.id,
    role: body.role,
  }).onConflictDoNothing().returning();

  if (inv) {
    const meta = extractRequestMeta(req);
    await logAudit({
      orgId: mgr.org.id,
      actorUserId: sess.user.id,
      action: "invite.send",
      targetType: "invitation",
      targetId: inv.id,
      metadata: {
        githubLogin: login,
        role: body.role,
        githubStatus: github?.ok ? github.status : "failed",
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  return NextResponse.json({ invitation: inv ?? null, github });
}
