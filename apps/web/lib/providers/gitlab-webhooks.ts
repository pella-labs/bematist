/**
 * Auto-register webhooks for a freshly-connected GitLab org. Tries the
 * group-webhook endpoint first (Premium), falls back to per-project hooks
 * (Free). Returns the count of successfully-registered hooks plus any errors
 * for the caller to surface.
 *
 * Called from the OAuth callback after the org row is created and the
 * webhook secret is stored in `org_credentials.webhook_secret_enc`.
 */

import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { decryptOrgCredential } from "@/lib/crypto/org-credentials";

const GITLAB = "https://gitlab.com";

const HOOK_EVENTS = {
  push_events: true,
  merge_requests_events: true,
  issues_events: false,
  note_events: false,
  pipeline_events: false,
  releases_events: false,
  tag_push_events: false,
  // group hooks support these too:
  member_events: true,
  subgroup_events: false,
  enable_ssl_verification: true,
};

export type RegisterWebhooksResult = {
  scope: "group" | "projects" | "none";
  registered: number;
  errors: string[];
};

export async function registerWebhooksForOrg(
  orgId: string,
  baseUrl: string,
): Promise<RegisterWebhooksResult> {
  const errors: string[] = [];
  // Pull credential + org info.
  const [org] = await db.select().from(schema.org).where(eq(schema.org.id, orgId)).limit(1);
  if (!org || org.provider !== "gitlab" || !org.gitlabGroupId) {
    return { scope: "none", registered: 0, errors: ["Not a GitLab org"] };
  }
  const [cred] = await db.select().from(schema.orgCredentials)
    .where(and(eq(schema.orgCredentials.orgId, orgId), eq(schema.orgCredentials.kind, "gitlab_oauth_app")))
    .limit(1);
  if (!cred?.tokenEnc) {
    return { scope: "none", registered: 0, errors: ["No OAuth credential for this org"] };
  }
  if (!cred.webhookSecretEnc) {
    return { scope: "none", registered: 0, errors: ["No webhook secret stored — re-run connect"] };
  }
  const accessToken = decryptOrgCredential(cred.tokenEnc);
  const webhookSecret = decryptOrgCredential(cred.webhookSecretEnc);
  const url = `${baseUrl}/api/gitlab-webhook/${orgId}`;

  // Try group-level first.
  const groupHookRes = await fetch(`${GITLAB}/api/v4/groups/${org.gitlabGroupId}/hooks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, token: webhookSecret, ...HOOK_EVENTS }),
  });
  if (groupHookRes.ok) {
    return { scope: "group", registered: 1, errors: [] };
  }

  // 403/404 → likely Free tier (no group hooks). Fall back to per-project.
  if (groupHookRes.status !== 403 && groupHookRes.status !== 404) {
    const body = await groupHookRes.text().catch(() => "");
    errors.push(`Group webhook failed (${groupHookRes.status}): ${body.slice(0, 200)}`);
  }

  // List projects in the group, then add a hook per project.
  const projects: any[] = [];
  let page = 1;
  while (true) {
    const r = await fetch(
      `${GITLAB}/api/v4/groups/${org.gitlabGroupId}/projects?per_page=100&include_subgroups=true&page=${page}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
    );
    if (!r.ok) {
      errors.push(`List projects failed (${r.status})`);
      break;
    }
    const batch = await r.json() as any[];
    projects.push(...batch);
    if (batch.length < 100) break;
    page++;
    if (page > 20) break; // safety
  }

  let registered = 0;
  for (const p of projects) {
    const ph = await fetch(`${GITLAB}/api/v4/projects/${p.id}/hooks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, token: webhookSecret, ...HOOK_EVENTS }),
    });
    if (ph.ok) {
      registered++;
    } else {
      const body = await ph.text().catch(() => "");
      errors.push(`Hook for ${p.path_with_namespace} failed (${ph.status}): ${body.slice(0, 100)}`);
    }
  }

  return { scope: "projects", registered, errors };
}
