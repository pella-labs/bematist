// HMAC dual-accept verifier (PRD §11.5, D55).
//
// On each webhook:
//   1. Resolve the active secret. Verify. On match → ok = true.
//   2. On mismatch, if the installation is inside the 10-minute rotation
//      window (`now() - rotated_at < 10m` AND `previous_ref` not null) AND
//      the previous secret resolves → retry with it. On match → ok = true
//      + increment `github_webhook_signature_fallback_used_total`.
//   3. Otherwise → reject. Increment `github_webhook_signature_reject_total`
//      with `reason` label.
//
// The helper is pure over its dependencies — the router hands it the
// installation record, the secrets resolver, and the raw body + signature.
// This keeps rotation policy in one file and independently unit-testable.

import { verifiers, type WebhookDelivery } from "../webhooks/verify";
import type { InstallationRecord } from "./installationResolver";
import { incrCounter } from "./metrics";
import type { WebhookSecretResolver } from "./secretsResolver";

/** Default rotation acceptance window (PRD §11.5 — "10 min"). */
export const DEFAULT_ROTATION_WINDOW_MS = 10 * 60 * 1000;

export type VerifyRejectReason =
  | "no_active_secret"
  | "active_mismatch_no_window"
  | "active_mismatch_window_expired"
  | "active_mismatch_no_previous_ref"
  | "active_mismatch_previous_secret_missing"
  | "both_mismatch";

export interface VerifyOk {
  ok: true;
  /** Which secret verified. `fallback` is the rotation-previous path. */
  path: "active" | "fallback";
}

export interface VerifyReject {
  ok: false;
  reason: VerifyRejectReason;
}

export type VerifyResult = VerifyOk | VerifyReject;

export interface VerifyWithRotationDeps {
  installation: InstallationRecord;
  resolver: WebhookSecretResolver;
  delivery: WebhookDelivery;
  now?: () => Date;
  rotationWindowMs?: number;
}

export async function verifyWithRotation(deps: VerifyWithRotationDeps): Promise<VerifyResult> {
  const now = deps.now?.() ?? new Date();
  const windowMs = deps.rotationWindowMs ?? DEFAULT_ROTATION_WINDOW_MS;

  const activeSecret = await deps.resolver.resolve(deps.installation.webhook_secret_active_ref);
  if (!activeSecret) {
    incrCounter("github_webhook_signature_reject_total", { reason: "no_active_secret" });
    return { ok: false, reason: "no_active_secret" };
  }

  const okActive = verifiers.github.verify(deps.delivery, activeSecret);
  if (okActive) return { ok: true, path: "active" };

  // Active mismatch — evaluate the fallback window before we count the full
  // reject, so operators can differentiate "spoof attempt" from "rotation in
  // flight" via label cardinality.
  const rotatedAt = deps.installation.webhook_secret_rotated_at;
  if (!deps.installation.webhook_secret_previous_ref || !rotatedAt) {
    incrCounter("github_webhook_signature_reject_total", {
      reason: "active_mismatch_no_previous_ref",
    });
    return { ok: false, reason: "active_mismatch_no_previous_ref" };
  }

  const ageMs = now.getTime() - rotatedAt.getTime();
  if (ageMs >= windowMs) {
    incrCounter("github_webhook_signature_reject_total", {
      reason: "active_mismatch_window_expired",
    });
    return { ok: false, reason: "active_mismatch_window_expired" };
  }

  const previousSecret = await deps.resolver.resolve(deps.installation.webhook_secret_previous_ref);
  if (!previousSecret) {
    incrCounter("github_webhook_signature_reject_total", {
      reason: "active_mismatch_previous_secret_missing",
    });
    return { ok: false, reason: "active_mismatch_previous_secret_missing" };
  }

  const okPrev = verifiers.github.verify(deps.delivery, previousSecret);
  if (okPrev) {
    incrCounter("github_webhook_signature_fallback_used_total", {});
    return { ok: true, path: "fallback" };
  }

  incrCounter("github_webhook_signature_reject_total", { reason: "both_mismatch" });
  return { ok: false, reason: "both_mismatch" };
}
