import { z } from "zod";

/**
 * `POST /api/admin/github/history-backfill` — admin manually triggers the
 * 90-day retroactive PR + commit ingestion for the caller's installation.
 *
 * The mutation seeds queued rows in `github_history_sync_progress`; a
 * worker dispatcher drains them. Response reflects the seeded state so the
 * admin UI can render a progress bar immediately.
 */
export const EnqueueHistoryBackfillInput = z.object({
  /** Optional — defaults to the single installation bound to the tenant. */
  installation_id: z.string().regex(/^\d+$/).optional(),
  /** Window length in days. Default 90. Future: wire from "custom range" UI. */
  window_days: z.number().int().positive().max(365).default(90),
});
export type EnqueueHistoryBackfillInput = z.input<typeof EnqueueHistoryBackfillInput>;

export const EnqueueHistoryBackfillOutput = z.object({
  installation_id: z.string(),
  repos_queued: z.number().int().nonnegative(),
  rows_queued: z.number().int().nonnegative(),
  since_ts: z.string().datetime(),
});
export type EnqueueHistoryBackfillOutput = z.infer<typeof EnqueueHistoryBackfillOutput>;
