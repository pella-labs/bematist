// PRD risk #5: Manager backdoor.
//
// Every attempt to view an IC's page through the `/engineer/:id` surface
// MUST:
//   (a) write an `audit_events` row with `surface = 'engineer_page'`
//       BEFORE authorization is decided (tamper-evident trail);
//   (b) throw FORBIDDEN unless the caller is admin/manager/auditor,
//       OR the caller is the subject themselves.
//
// Non-admin ICs attempting to view another IC's page are rejected. The
// caller's session_ctx.tenant_id is the authoritative tenant. Cross-tenant
// probing is blocked at the RLS layer (audit_events org_id FK).
//
// Integration tests live in
// `apps/web/app/api/engineer/[id]/view/route.test.ts`.

import { createHash } from "node:crypto";
import { AuthError, assertRole, type Ctx } from "../auth";

export interface EngineerViewAttemptInput {
  /** Target IC's internal id (uuid). */
  target_engineer_id: string;
  /** Session id the view was entered from, if any. Hashed on write. */
  session_id?: string;
  /** Reason the viewer is opening this surface (free-text, audit-only). */
  reason?: string;
}

export interface EngineerViewAttemptOutput {
  ok: boolean;
  audit_event_id: string;
}

export async function recordEngineerViewAttempt(
  ctx: Ctx,
  input: EngineerViewAttemptInput,
): Promise<EngineerViewAttemptOutput> {
  // STEP 1 — ALWAYS write the audit row first, authorization result be damned.
  // Failing-closed on write means we never silently elide a panopticon attempt.
  const targetHash = sha256Hex(input.target_engineer_id);
  const sessionHash = input.session_id ? sha256Hex(input.session_id) : null;
  const rows = await ctx.db.pg.query<{ id: string }>(
    `INSERT INTO audit_events
        (org_id, actor_user_id, target_engineer_id_hash, surface, session_id_hash)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [ctx.tenant_id, ctx.actor_id, targetHash, "engineer_page", sessionHash],
  );
  const auditId = rows[0]?.id;
  if (!auditId) throw new Error("engineer-view: audit_events INSERT returned no id");

  // STEP 2 — authorize. If the caller is the subject, always allow. If the
  // caller is admin/manager/auditor, allow. Otherwise FORBIDDEN.
  const viewingSelf = ctx.actor_id === input.target_engineer_id;
  if (viewingSelf) return { ok: true, audit_event_id: auditId };

  try {
    assertRole(ctx, ["admin", "manager", "auditor"]);
  } catch (err) {
    if (err instanceof AuthError) {
      throw new AuthError(
        "FORBIDDEN",
        `role '${ctx.role}' cannot view engineer page for another user. ` +
          `Attempt has been recorded (audit_event=${auditId}); the IC will see it in their daily digest.`,
      );
    }
    throw err;
  }

  return { ok: true, audit_event_id: auditId };
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
