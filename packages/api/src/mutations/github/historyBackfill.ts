import { AuthError, assertRole, type Ctx } from "../../auth";
import type {
  EnqueueHistoryBackfillInput,
  EnqueueHistoryBackfillOutput,
} from "../../schemas/github/historyBackfill";

/**
 * `POST /api/admin/github/history-backfill` — admin-only. Seeds `queued`
 * rows in `github_history_sync_progress` for every tracked repo on the
 * caller's installation. The worker dispatcher drains them.
 *
 * Tracking projection matches the live tracking model:
 *   - orgs.github_repo_tracking_mode='all'      → all repos minus excluded
 *   - orgs.github_repo_tracking_mode='selected' → only included
 *
 * Idempotent: if a row already exists, ON CONFLICT resets it to `queued`
 * and clears the cursor so the admin's click forces a fresh walk.
 *
 * Audit-logged (`github.history_backfill_enqueued`) per CLAUDE.md §Security.
 */
export async function enqueueGithubHistoryBackfill(
  ctx: Ctx,
  input: EnqueueHistoryBackfillInput,
): Promise<EnqueueHistoryBackfillOutput> {
  assertRole(ctx, ["admin"]);

  const windowDays = input?.window_days ?? 90;

  const installRows = await ctx.db.pg.query<{ installation_id: string | bigint }>(
    `SELECT installation_id::text AS installation_id
       FROM github_installations
      WHERE tenant_id = $1
        ${input?.installation_id ? "AND installation_id = $2" : ""}
      ORDER BY installed_at DESC
      LIMIT 1`,
    input?.installation_id ? [ctx.tenant_id, input.installation_id] : [ctx.tenant_id],
  );
  const install = installRows[0];
  if (!install) {
    throw new AuthError(
      "FORBIDDEN",
      "No GitHub installation bound to your org. Connect the GitHub App first.",
    );
  }
  const installationId = String(install.installation_id);

  // Gate on initial-sync completion — there's nothing to backfill into until
  // the repo catalog is populated.
  const syncRows = await ctx.db.pg.query<{ status: string }>(
    `SELECT status
       FROM github_sync_progress
      WHERE tenant_id = $1 AND installation_id = $2
      LIMIT 1`,
    [ctx.tenant_id, installationId],
  );
  const syncStatus = syncRows[0]?.status;
  if (syncStatus !== "completed") {
    throw new AuthError(
      "FORBIDDEN",
      "Initial repo sync must complete before the history backfill can run.",
    );
  }

  const sinceTs = new Date(Date.now() - windowDays * 86_400_000).toISOString();

  // Build the tracked-repo projection in SQL — keeps the v1 path dependency-
  // free of the worker package (the worker owns the canonical helper; this
  // mutation inlines the same projection so the API package stays leaf).
  const repoRows = await ctx.db.pg.query<{
    provider_repo_id: string | null;
    tracking_state: string;
    mode: string;
  }>(
    `SELECT r.provider_repo_id, r.tracking_state,
            o.github_repo_tracking_mode AS mode
       FROM repos r
       JOIN orgs o ON o.id = r.org_id
      WHERE r.org_id = $1
        AND r.provider = 'github'
        AND r.provider_repo_id IS NOT NULL
        AND r.deleted_at IS NULL
        AND r.archived_at IS NULL`,
    [ctx.tenant_id],
  );
  const tracked: string[] = [];
  for (const r of repoRows) {
    if (!r.provider_repo_id) continue;
    const isTracked =
      r.mode === "selected" ? r.tracking_state === "included" : r.tracking_state !== "excluded";
    if (isTracked) tracked.push(r.provider_repo_id);
  }

  let rowsQueued = 0;
  for (const providerRepoId of tracked) {
    for (const kind of ["pulls", "commits"] as const) {
      await ctx.db.pg.query(
        `INSERT INTO github_history_sync_progress
           (tenant_id, installation_id, provider_repo_id, kind, status,
            since_ts, requested_by, last_progress_at, updated_at)
         VALUES ($1, $2, $3, $4, 'queued', $5, $6, now(), now())
         ON CONFLICT (tenant_id, installation_id, provider_repo_id, kind)
           DO UPDATE SET
             status            = 'queued',
             since_ts          = EXCLUDED.since_ts,
             next_page_cursor  = NULL,
             fetched           = 0,
             pages_fetched     = 0,
             started_at        = NULL,
             completed_at      = NULL,
             last_error        = NULL,
             last_progress_at  = now(),
             updated_at        = now(),
             requested_by      = COALESCE(EXCLUDED.requested_by, github_history_sync_progress.requested_by)`,
        [ctx.tenant_id, installationId, providerRepoId, kind, sinceTs, ctx.actor_id],
      );
      rowsQueued += 1;
    }
  }

  try {
    await ctx.db.pg.query(
      `INSERT INTO audit_log
         (org_id, actor_user_id, action, target_type, target_id, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        ctx.tenant_id,
        ctx.actor_id,
        "github.history_backfill_enqueued",
        "github_installation",
        installationId,
        JSON.stringify({
          window_days: windowDays,
          repos_queued: tracked.length,
          rows_queued: rowsQueued,
          since_ts: sinceTs,
        }),
      ],
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        level: "error",
        module: "api/mutations/github/historyBackfill",
        msg: "audit_log write failed",
        err: msg,
      }),
    );
  }

  return {
    installation_id: installationId,
    repos_queued: tracked.length,
    rows_queued: rowsQueued,
    since_ts: sinceTs,
  };
}
