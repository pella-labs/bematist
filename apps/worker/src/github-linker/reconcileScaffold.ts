// Hourly reconciliation scaffold (PRD §11.3, D51, risk #6 mitigation).
//
// Goal at G1: prove the cron is ALIVE and lists installations to reconcile.
// Actual redelivery-wired reconciliation + gap detection is TODO(g3).
//
// What this scaffold does:
//   - enumerate active `github_installations`
//   - update each installation's `last_reconciled_at = now()` (a heartbeat)
//   - emit a structured log line so the `github_reconciliation_duration_seconds`
//     metric has something to measure
//
// What G3 adds:
//   - actual `GET /repos/:owner/:repo/pulls` pagination (7-day window)
//   - gap detection against captured webhooks
//   - redelivery-request API wiring
//   - tighter rate-limit observance per PRD §11.2 D59.

import type { Sql } from "postgres";

export interface ReconcileScaffoldResult {
  installationsChecked: number;
  heartbeatsWritten: number;
}

export async function runReconcileScaffold(
  sql: Sql,
  now: Date = new Date(),
): Promise<ReconcileScaffoldResult> {
  const rows = (await sql.unsafe(
    `SELECT tenant_id, installation_id FROM github_installations WHERE status = 'active'`,
    [],
  )) as unknown as Array<{ tenant_id: string; installation_id: string }>;
  let heartbeatsWritten = 0;
  for (const row of rows) {
    const res = (await sql.unsafe(
      `UPDATE github_installations
         SET last_reconciled_at = $3::timestamptz, updated_at = now()
         WHERE tenant_id = $1 AND installation_id = $2`,
      [row.tenant_id, row.installation_id, now.toISOString()],
    )) as unknown as { count?: number };
    heartbeatsWritten += Number(res.count ?? 0);
  }
  // TODO(g3): per-installation GET /repos/:owner/:repo/pulls ∆ detection +
  //           redelivery-request when a known delivery_id is missing from
  //           our webhook-ingest dedup window.
  return { installationsChecked: rows.length, heartbeatsWritten };
}
