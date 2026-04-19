import { AuthError, assertRole, type Ctx } from "../../auth";
import type {
  PatchRepoTrackingInput,
  PatchRepoTrackingOutput,
  TrackingState,
} from "../../schemas/github/tracking";

/**
 * PRD §14 — `PATCH /api/admin/github/repos/:provider_repo_id/tracking`.
 *
 * Admin-only. Writes `repos.tracking_state` and emits a scoped
 * `session_repo_recompute` message — bounded to sessions whose current
 * `session_repo_links.repo_id_hash` intersects with this repo's hash (D56).
 *
 * Idempotent; no-op recompute when value unchanged.
 */

export interface RecomputeScopedEmitter {
  /**
   * Fan recompute requests out to exactly the sessions whose enrichment
   * set intersects this repo. Returns the count enqueued.
   */
  emitRepoTrackingFlipped(args: {
    tenant_id: string;
    provider_repo_id: string;
    nextState: TrackingState;
  }): Promise<number>;
}

export interface PatchRepoTrackingDeps {
  recompute: RecomputeScopedEmitter;
}

export async function patchRepoTracking(
  ctx: Ctx,
  input: PatchRepoTrackingInput,
  deps: PatchRepoTrackingDeps,
): Promise<PatchRepoTrackingOutput> {
  assertRole(ctx, ["admin"]);

  const rows = await ctx.db.pg.query<{ tracking_state: string; id: string }>(
    `SELECT tracking_state, id::text AS id
       FROM repos
      WHERE org_id = $1
        AND provider = 'github'
        AND provider_repo_id = $2
        AND deleted_at IS NULL
      LIMIT 1`,
    [ctx.tenant_id, input.provider_repo_id],
  );
  const existing = rows[0];
  if (!existing) {
    throw new AuthError(
      "FORBIDDEN",
      `Repo provider_repo_id=${input.provider_repo_id} not found in your org.`,
    );
  }
  const previousState = normalizeState(existing.tracking_state);
  const unchanged = previousState === input.state;

  if (!unchanged) {
    await ctx.db.pg.query(
      `UPDATE repos
          SET tracking_state = $3
        WHERE org_id = $1
          AND provider = 'github'
          AND provider_repo_id = $2`,
      [ctx.tenant_id, input.provider_repo_id, input.state],
    );
  }

  let queued = 0;
  if (!unchanged) {
    queued = await deps.recompute.emitRepoTrackingFlipped({
      tenant_id: ctx.tenant_id,
      provider_repo_id: input.provider_repo_id,
      nextState: input.state,
    });
  }

  try {
    await ctx.db.pg.query(
      `INSERT INTO audit_log
         (org_id, actor_user_id, action, target_type, target_id, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        ctx.tenant_id,
        ctx.actor_id,
        "github.repo_tracking_updated",
        "github_repo",
        input.provider_repo_id,
        // Pass object, not stringified — see trackingMode.ts note.
        {
          previous: previousState,
          next: input.state,
          unchanged,
          sessions_queued: queued,
        },
      ],
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        level: "error",
        module: "api/mutations/github/repoTracking",
        msg: "audit_log write failed",
        err: msg,
      }),
    );
  }

  return {
    provider_repo_id: input.provider_repo_id,
    state: input.state,
    sessions_recompute_queued: queued,
  };
}

function normalizeState(raw: string): TrackingState {
  if (raw === "included" || raw === "excluded") return raw;
  return "inherit";
}
