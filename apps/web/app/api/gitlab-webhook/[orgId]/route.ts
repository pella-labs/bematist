// POST /api/gitlab-webhook/[orgId]
// X-Gitlab-Token: <secret>
// X-Gitlab-Event: "Merge Request Hook" | "Push Hook" | "Member Hook" | …
//
// GitLab pushes events here. We verify the X-Gitlab-Token matches the secret
// we generated at OAuth-connect time (stored encrypted in
// org_credentials.webhook_secret_enc), then ingest the event.
//
// This is the read-path replacement for polling — we react to events instead
// of pulling. MR diff stats still need a follow-up API call (see fetchMrDetail).

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { decryptOrgCredential } from "@/lib/crypto/org-credentials";
import { fetchAndStoreMrDetail } from "@/lib/providers/gitlab-mr-detail";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<NextResponse> {
  const { orgId } = await params;
  const provided = req.headers.get("x-gitlab-token") ?? "";
  const event = req.headers.get("x-gitlab-event") ?? "";

  // Find the credential row first so we can validate.
  const [cred] = await db.select().from(schema.orgCredentials)
    .where(and(eq(schema.orgCredentials.orgId, orgId), eq(schema.orgCredentials.kind, "gitlab_oauth_app")))
    .limit(1);
  if (!cred?.webhookSecretEnc) {
    return NextResponse.json({ error: "no webhook configured" }, { status: 404 });
  }
  const expected = decryptOrgCredential(cred.webhookSecretEnc);

  // Constant-time compare to avoid timing-attack leak.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Dispatch by event type. Best-effort: an unknown event type returns 200 so
  // GitLab doesn't retry.
  try {
    if (event === "Merge Request Hook") {
      await handleMergeRequest(orgId, body);
    } else if (event === "Push Hook") {
      await handlePush(orgId, body);
    } else if (event === "Member Hook") {
      // Future: backfill membership view from member_added/member_removed events.
    }
  } catch (e) {
    // Log but ack — we don't want GitLab retrying for bugs on our side.
    console.error("[gitlab-webhook] handler error", { orgId, event, err: String(e) });
  }

  return NextResponse.json({ ok: true });
}

// --- handlers ---

async function handleMergeRequest(orgId: string, body: any): Promise<void> {
  const attrs = body?.object_attributes;
  const project = body?.project;
  if (!attrs || !project) return;

  // Map GitLab MR state to our pr.state ('open'|'merged'|'closed').
  const state = attrs.state === "merged" ? "merged"
    : attrs.state === "closed" ? "closed"
      : "open";

  const repoSlug = project.path_with_namespace as string;
  const number = attrs.iid as number;
  const url = attrs.url as string;

  const row = {
    orgId,
    provider: "gitlab" as const,
    repo: repoSlug,
    number,
    title: attrs.title ?? null,
    authorLogin: attrs?.last_commit?.author?.email?.split("@")[0] ?? null,  // best-effort; refined below
    state,
    additions: 0,    // filled in by fetchAndStoreMrDetail
    deletions: 0,
    changedFiles: 0,
    commits: 0,
    createdAt: new Date(attrs.created_at ?? Date.now()),
    mergedAt: attrs.merged_at ? new Date(attrs.merged_at) : null,
    url,
    fileList: [],
  };

  await db.insert(schema.pr).values(row).onConflictDoUpdate({
    target: [schema.pr.orgId, schema.pr.repo, schema.pr.number],
    set: {
      state: row.state,
      title: row.title,
      mergedAt: row.mergedAt,
      url: row.url,
      updatedAt: new Date(),
    },
  });

  // Hydrate diff stats via API (Phase 11.7). Best-effort.
  try {
    await fetchAndStoreMrDetail(orgId, project.id, attrs.iid, repoSlug);
  } catch { /* ignore */ }
}

async function handlePush(_orgId: string, _body: any): Promise<void> {
  // Push events arrive as raw commit batches. We don't currently materialize
  // a `commit` table — the MR-merge event is what closes the loop on shipped
  // code. Reserved for future commit-level analytics.
  return;
}
