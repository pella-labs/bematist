// GET /api/gitlab-oauth/callback?code=...&state=...
//
// GitLab redirects here after the customer authorizes the OAuth Application.
// We exchange the code for access + refresh tokens, persist encrypted, create
// the org row, and bounce to /org/{slug}.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { db, schema } from "@/lib/db";
import { encryptOrgCredential } from "@/lib/crypto/org-credentials";
import { decodeOauthPending, OAUTH_PENDING_COOKIE } from "@/lib/crypto/oauth-pending";
import { assertNoSlugOverlap, SlugOverlapError } from "@/lib/orgs/validate-slug";
import { registerWebhooksForOrg } from "@/lib/providers/gitlab-webhooks";

const GITLAB = "https://gitlab.com";

function errorRedirect(req: Request, message: string): NextResponse {
  const url = new URL("/setup/org/gitlab/oauth", req.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const gitlabError = url.searchParams.get("error");

  if (gitlabError) {
    return errorRedirect(req, `GitLab denied authorization: ${gitlabError}`);
  }
  if (!code || !state) {
    return errorRedirect(req, "Missing code or state from GitLab callback");
  }

  // Read + clear the pending cookie.
  const jar = await cookies();
  const cookie = jar.get(OAUTH_PENDING_COOKIE);
  if (!cookie?.value) return errorRedirect(req, "OAuth flow expired or missing — start again");
  jar.delete(OAUTH_PENDING_COOKIE);

  let pending: ReturnType<typeof decodeOauthPending>;
  try {
    pending = decodeOauthPending(cookie.value);
  } catch (e) {
    return errorRedirect(req, e instanceof Error ? e.message : "Invalid OAuth state");
  }

  if (pending.state !== state) {
    return errorRedirect(req, "State mismatch — possible CSRF, please retry");
  }

  // Exchange code → tokens.
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const redirectUri = `${baseUrl}/api/gitlab-oauth/callback`;

  const tokenRes = await fetch(`${GITLAB}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      client_id: pending.clientId,
      client_secret: pending.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    return errorRedirect(req,
      `Token exchange failed (${tokenRes.status}). Check that the redirect URI on your GitLab App matches exactly: ${redirectUri}`
        + (body ? ` · ${body.slice(0, 200)}` : ""));
  }
  const tok = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    created_at?: number;
    scope?: string;
    token_type?: string;
  };
  if (!tok.access_token) return errorRedirect(req, "GitLab returned no access token");

  // Validate the token can read the requested group.
  const groupRes = await fetch(`${GITLAB}/api/v4/groups/${pending.groupIdOrPath}`, {
    headers: { Authorization: `Bearer ${tok.access_token}` },
    cache: "no-store",
  });
  if (!groupRes.ok) {
    return errorRedirect(req,
      `OAuth succeeded but can't read group "${pending.groupIdOrPath}" (HTTP ${groupRes.status}). The authorizing user must be Maintainer or higher.`);
  }
  const group = await groupRes.json() as { id: number; full_path: string; full_name?: string; name: string };

  const slug = String(group.full_path).toLowerCase();

  try {
    await assertNoSlugOverlap("gitlab", slug);
  } catch (e) {
    if (e instanceof SlugOverlapError) {
      return errorRedirect(req, `This group's path overlaps an existing org "${e.conflictingSlug}".`);
    }
    return errorRedirect(req, "Slug validation failed");
  }

  // Compute expiry timestamps. GitLab's `expires_in` is seconds-from-now.
  const accessExpiresAt = tok.expires_in
    ? new Date(Date.now() + tok.expires_in * 1000)
    : new Date(Date.now() + 2 * 60 * 60 * 1000);  // safe default: 2h

  // Webhook secret for inbound HMAC verification later (Phase 11.5/11.6).
  const webhookSecret = crypto.randomBytes(32).toString("hex");

  // Encrypt the secrets.
  const accessTokenEnc = encryptOrgCredential(tok.access_token);
  const refreshTokenEnc = tok.refresh_token ? encryptOrgCredential(tok.refresh_token) : null;
  const clientSecretEnc = encryptOrgCredential(pending.clientSecret);
  const webhookSecretEnc = encryptOrgCredential(webhookSecret);

  let orgId: string;
  try {
    await db.transaction(async tx => {
      const [inserted] = await tx.insert(schema.org).values({
        provider: "gitlab",
        slug,
        name: group.full_name ?? group.name,
        gitlabGroupId: String(group.id),
        gitlabGroupPath: String(group.full_path),
      }).returning({ id: schema.org.id });
      orgId = inserted.id;

      await tx.insert(schema.orgCredentials).values({
        orgId,
        kind: "gitlab_oauth_app",
        tokenEnc: accessTokenEnc,
        refreshTokenEnc,
        clientId: pending.clientId,
        clientSecretEnc,
        scopes: tok.scope ?? null,
        expiresAt: accessExpiresAt,
        webhookSecretEnc,
      });

      await tx.insert(schema.membership).values({
        userId: pending.userId,
        orgId,
        role: "manager",
      });
    });
  } catch (e) {
    return errorRedirect(req, e instanceof Error ? e.message : "Failed to persist org");
  }

  // Auto-register webhooks. Best-effort — failures don't block the connect
  // (manager can re-trigger from org settings later). Group webhook on Premium,
  // per-project on Free.
  try {
    await registerWebhooksForOrg(orgId!, baseUrl);
  } catch {
    // ignore — surfaced separately if needed
  }

  const next = new URL(`/org/${encodeURIComponent(slug)}`, req.url);
  return NextResponse.redirect(next);
}
