import { AuthError, assertRole, type Ctx } from "../../auth";
import type {
  RotateWebhookSecretInput,
  RotateWebhookSecretOutput,
} from "../../schemas/github/webhookSecret";
import { ROTATION_WINDOW_MINUTES } from "../../schemas/github/webhookSecret";

/**
 * PRD §14 — `POST /api/admin/github/webhook-secret/rotate`.
 *
 * Atomic two-column swap on `github_installations` per §11.5 (D55). Both
 * OLD and NEW secrets accept signatures for 10 minutes; PR #85's eviction
 * cron nulls `webhook_secret_previous_ref` once the window closes.
 *
 * Admin-only. Audit-logged.
 */
export async function rotateWebhookSecret(
  ctx: Ctx,
  input: RotateWebhookSecretInput,
  opts: { now?: () => Date } = {},
): Promise<RotateWebhookSecretOutput> {
  assertRole(ctx, ["admin"]);

  const now = opts.now ?? (() => new Date());
  const rotatedAt = now();

  // Resolve the target installation (default = single installation).
  const installRows = await ctx.db.pg.query<{ installation_id: string | bigint }>(
    `SELECT installation_id::text AS installation_id
       FROM github_installations
      WHERE tenant_id = $1
        ${input.installation_id ? "AND installation_id = $2" : ""}
      ORDER BY installed_at DESC
      LIMIT 1`,
    input.installation_id ? [ctx.tenant_id, input.installation_id] : [ctx.tenant_id],
  );
  const install = installRows[0];
  if (!install) {
    throw new AuthError(
      "FORBIDDEN",
      "No GitHub installation bound to your org. Connect the GitHub App first.",
    );
  }
  const installationId = String(install.installation_id);

  // Atomic two-column swap: active → previous, new → active, set rotated_at.
  // RETURNING tells us the previous ref value for the audit log (opaque, not
  // sensitive — the bytes live in the secrets store).
  const updated = await ctx.db.pg.query<{
    webhook_secret_previous_ref: string | null;
    webhook_secret_active_ref: string;
    webhook_secret_rotated_at: unknown;
  }>(
    `UPDATE github_installations
        SET webhook_secret_previous_ref = webhook_secret_active_ref,
            webhook_secret_active_ref   = $3,
            webhook_secret_rotated_at   = $4,
            updated_at                  = $4
      WHERE tenant_id = $1
        AND installation_id = $2
      RETURNING webhook_secret_previous_ref,
                webhook_secret_active_ref,
                webhook_secret_rotated_at`,
    [ctx.tenant_id, installationId, input.new_secret_ref, rotatedAt],
  );
  if (updated.length === 0) {
    throw new AuthError(
      "FORBIDDEN",
      "GitHub installation rotation failed (no row updated — likely RLS mismatch).",
    );
  }

  const windowExpiresAt = new Date(rotatedAt.getTime() + ROTATION_WINDOW_MINUTES * 60_000);

  try {
    await ctx.db.pg.query(
      `INSERT INTO audit_log
         (org_id, actor_user_id, action, target_type, target_id, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        ctx.tenant_id,
        ctx.actor_id,
        "github.webhook_secret_rotated",
        "github_installation",
        installationId,
        JSON.stringify({
          new_secret_ref: input.new_secret_ref,
          window_minutes: ROTATION_WINDOW_MINUTES,
          rotated_at: rotatedAt.toISOString(),
          window_expires_at: windowExpiresAt.toISOString(),
        }),
      ],
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        level: "error",
        module: "api/mutations/github/rotateWebhookSecret",
        msg: "audit_log write failed",
        err: msg,
      }),
    );
  }

  return {
    installation_id: installationId,
    rotated_at: rotatedAt.toISOString(),
    window_expires_at: windowExpiresAt.toISOString(),
    new_secret_ref: input.new_secret_ref,
  };
}
