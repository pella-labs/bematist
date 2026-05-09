"use server";

import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import { encodeOauthPending, OAUTH_PENDING_COOKIE } from "@/lib/crypto/oauth-pending";

const GITLAB = "https://gitlab.com";

export async function startGitlabOauth(formData: FormData): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/");

  const clientId = String(formData.get("client_id") ?? "").trim();
  const clientSecret = String(formData.get("client_secret") ?? "").trim();
  const groupRaw = String(formData.get("group") ?? "").trim();

  if (!clientId || !clientSecret || !groupRaw) {
    redirect(`/setup/org/gitlab/oauth?error=${encodeURIComponent("Missing required field")}`);
  }

  // Strip a pasted URL if user copied the full GitLab group URL.
  const groupCleaned = groupRaw
    .replace(/^https?:\/\/[^/]+\/+/i, "")
    .replace(/^groups\//, "")
    .replace(/\/?$/, "")
    .replace(/^\/+/, "");

  // CSRF + correlation token. Echoes through GitLab and back via the `state` query param.
  const state = crypto.randomBytes(16).toString("hex");

  // Encrypt the round-trip payload into a HttpOnly cookie. Decrypted in the
  // /api/gitlab-oauth/callback handler.
  const cookiePayload = encodeOauthPending({
    state,
    userId: session!.user.id,
    groupIdOrPath: groupCleaned,
    clientId,
    clientSecret,
    createdAt: Date.now(),
  });

  const jar = await cookies();
  jar.set(OAUTH_PENDING_COOKIE, cookiePayload, {
    httpOnly: true,
    secure: (process.env.BETTER_AUTH_URL ?? "").startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 minutes
  });

  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const redirectUri = `${baseUrl}/api/gitlab-oauth/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    scope: "read_api",  // Default scope; customer can pick `api` in their App settings if they want write access.
  });

  redirect(`${GITLAB}/oauth/authorize?${params.toString()}`);
}
