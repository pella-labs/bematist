import { AuthError, assertRole, type Ctx } from "../../auth";
import type {
  ClaimPendingInstallationInput,
  ClaimPendingInstallationOutput,
} from "../../schemas/github/claimPending";

/**
 * PRD §17 B1 — Admin claim of a `github_pending_installations` row.
 *
 * Flow: the `installation.created` webhook landed in the pending table
 * (global-admin RLS — see migration 0011). An admin on this tenant clicks
 * "Claim" in /admin/github. This mutation:
 *   1. Elevates to the global-admin RLS context (sets
 *      `app.is_global_admin=true` for this txn) to read/update the pending row.
 *   2. Inserts a `github_installations` row bound to the admin's tenant with
 *      status='active'. Uses the token_ref / webhook_secret_ref the caller
 *      supplied (secret-manager pointers — we never store plaintext).
 *   3. Marks the pending row claimed (claimed_at, claimed_by_tenant_id).
 *   4. Writes an `audit_log` row (admin + installation_id + claimed_at).
 *
 * Admin-only. Idempotency: a double-click re-runs step 1/2 under
 * `ON CONFLICT DO NOTHING` on the (tenant_id, installation_id) unique; the
 * second call still sees the pending row as claimed and returns BAD_REQUEST.
 */
export async function claimPendingInstallation(
  ctx: Ctx,
  input: ClaimPendingInstallationInput,
): Promise<ClaimPendingInstallationOutput> {
  assertRole(ctx, ["admin"]);

  // Whole flow runs inside a single transaction so `SET LOCAL` GUCs
  // (app.is_global_admin → pending-table RLS bypass; app.current_org_id →
  // tenant-scoped RLS for github_installations) stay pinned to one
  // connection. `ctx.db.pg.transaction` is the production-wired hook
  // (apps/web/lib/db.ts); tests provide a matching sql.begin shim.
  if (!ctx.db.pg.transaction) {
    throw new AuthError("BAD_REQUEST", "pg client missing transaction support");
  }
  return await ctx.db.pg.transaction<ClaimPendingInstallationOutput>(async (tx) => {
    await tx.query(`SET LOCAL app.is_global_admin = 'true'`);
    await tx.query(`SELECT set_config('app.current_org_id', $1, true)`, [ctx.tenant_id]);

    const pendingRows = await tx.query<{
      id: string;
      installation_id: string;
      github_org_id: string;
      github_org_login: string;
      app_id: string;
      claimed_at: Date | null;
    }>(
      `SELECT id::text AS id,
              installation_id::text AS installation_id,
              github_org_id::text AS github_org_id,
              github_org_login,
              app_id::text AS app_id,
              claimed_at
         FROM github_pending_installations
        WHERE id = $1::bigint`,
      [input.pending_id],
    );
    const pending = pendingRows[0];
    if (!pending) {
      throw new AuthError("BAD_REQUEST", `pending installation ${input.pending_id} not found`);
    }
    if (pending.claimed_at !== null) {
      throw new AuthError("BAD_REQUEST", "pending installation already claimed");
    }

    const installRows = await tx.query<{ installation_id: string }>(
      `INSERT INTO github_installations
         (tenant_id, installation_id, github_org_id, github_org_login, app_id,
          status, token_ref, webhook_secret_active_ref)
       VALUES ($1, $2::bigint, $3::bigint, $4, $5::bigint,
               'active', $6, $7)
       ON CONFLICT (tenant_id, installation_id) DO NOTHING
       RETURNING installation_id::text AS installation_id`,
      [
        ctx.tenant_id,
        pending.installation_id,
        pending.github_org_id,
        pending.github_org_login,
        pending.app_id,
        input.token_ref,
        input.webhook_secret_ref,
      ],
    );
    if (installRows.length === 0) {
      throw new AuthError("BAD_REQUEST", "installation already bound to this tenant");
    }

    const claimedAt = new Date().toISOString();
    await tx.query(
      `UPDATE github_pending_installations
          SET claimed_at = $2::timestamptz,
              claimed_by_tenant_id = $3,
              updated_at = now()
        WHERE id = $1::bigint`,
      [input.pending_id, claimedAt, ctx.tenant_id],
    );

    await tx.query(
      `INSERT INTO audit_log
         (org_id, actor_user_id, action, target_type, target_id, metadata_json)
       VALUES ($1, $2, 'github.installation.claim', 'github_installation', $3, $4::jsonb)`,
      [
        ctx.tenant_id,
        ctx.actor_id,
        pending.installation_id,
        JSON.stringify({
          pending_id: input.pending_id,
          github_org_login: pending.github_org_login,
        }),
      ],
    );

    return {
      installation_id: pending.installation_id,
      tenant_id: ctx.tenant_id,
      claimed_at: claimedAt,
    };
  });
}
