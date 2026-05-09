/**
 * Hydrate MR diff stats (additions, deletions, changed files, commit count)
 * for a GitLab MR. Webhook payloads don't include these — they require a
 * follow-up call to /projects/:id/merge_requests/:iid/changes.
 *
 * Called from the webhook receiver after persisting the basic MR state, and
 * potentially from a backfill job when an org first connects.
 *
 * Idempotent: caller is expected to have UPSERTed the pr row first; this
 * function UPDATEs the diff-stat columns only.
 */

import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { decryptOrgCredential } from "@/lib/crypto/org-credentials";

const GITLAB = "https://gitlab.com";

export async function fetchAndStoreMrDetail(
  orgId: string,
  projectId: number | string,
  mrIid: number,
  repo: string,
): Promise<void> {
  const [cred] = await db.select().from(schema.orgCredentials)
    .where(and(eq(schema.orgCredentials.orgId, orgId), eq(schema.orgCredentials.kind, "gitlab_oauth_app")))
    .limit(1);
  if (!cred?.tokenEnc) return;
  const accessToken = decryptOrgCredential(cred.tokenEnc);

  // /merge_requests/:iid/changes returns the MR with `changes[]` and overall stats.
  const r = await fetch(`${GITLAB}/api/v4/projects/${projectId}/merge_requests/${mrIid}/changes`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!r.ok) return;
  const detail = await r.json() as any;
  const changes: any[] = Array.isArray(detail?.changes) ? detail.changes : [];

  // Tally LOC. GitLab returns per-file diffs as text; count "+"/"-" lines.
  let additions = 0, deletions = 0;
  for (const ch of changes) {
    const diff = String(ch?.diff ?? "");
    for (const line of diff.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions++;
      else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
    }
  }

  let commits = 0;
  try {
    const cr = await fetch(`${GITLAB}/api/v4/projects/${projectId}/merge_requests/${mrIid}/commits?per_page=100`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (cr.ok) {
      const arr = await cr.json() as any[];
      commits = arr.length;
    }
  } catch { /* ignore */ }

  const fileList = changes.map(c => String(c?.new_path ?? c?.old_path ?? "")).filter(Boolean);

  // Author login refinement.
  const authorLogin = detail?.author?.username ?? null;

  await db.update(schema.pr).set({
    additions,
    deletions,
    changedFiles: changes.length,
    commits,
    fileList,
    authorLogin,
    updatedAt: new Date(),
  }).where(and(
    eq(schema.pr.orgId, orgId),
    eq(schema.pr.repo, repo),
    eq(schema.pr.number, mrIid),
  ));
}
