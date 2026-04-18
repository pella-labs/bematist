-- M3 follow-up #4: per-PR outcome rollup. Per CLAUDE.md §Outcome Attribution
-- Rules §8.5 — outcomes anchor on `code_edit_tool.decision=accept` (primary),
-- the `AI-Assisted:` trailer (D29), and `pr_number` / `commit_sha` / `branch`
-- denormalized onto `events` (fallback). This MV pre-aggregates agent-side
-- signals per (org_id, repo, pr_number, day) so `/dashboard/outcomes` reads a
-- bounded rollup instead of scanning raw events.
--
-- Only events carrying a non-NULL `pr_number` participate — matching
-- repo_weekly_rollup's repo_id_hash filter. Events joined by the GitHub App
-- webhook (`push` + `pull_request`) set `pr_number` on write; the
-- trailer-based path does the same when the hook parses the sessionId.
--
-- Grouping on `day = toDate(ts, 'UTC')` mirrors the dev_daily_rollup partition
-- shape so GDPR DROP PARTITION on agent events cascades cleanly. A PR that
-- spans days gets split into multiple rows; query-time *Merge folds them
-- back together.
--
-- State columns use AggregateFunction so downstream reads combine via *Merge:
--   - accepted_edit_count_state   countIfState(accept AND hunk_sha256 IS NOT NULL)
--   - cost_usd_state              sumState(cost_usd)
--   - input_tokens_state          sumState(input_tokens)
--   - output_tokens_state         sumState(output_tokens)
--   - duration_ms_p95_state       quantileState(0.95)(duration_ms) over LLM calls
--   - contributors_state          uniqState(engineer_id)
--   - first_ts_state / last_ts_state  min/maxState(ts)
--   - revert_count_state          sumState(coalesce(revert_within_24h,0))
--   - ai_assisted_flag_state      maxState(1 if any accepted edit — the PR is
--                                 marked ai_assisted if at least one agent
--                                 accept event landed against it)
--
-- Merge state lives in Postgres `git_events` written by the GitHub App; agent
-- telemetry cannot observe it. We surface `last_ts` as a proxy `merged_at` at
-- query time; the PG join lands in a follow-up.
-- pr_number stays Nullable(UInt32) in the key — CH 25+ optimizer rewrites
-- `WHERE pr_number IS NOT NULL AND assumeNotNull(pr_number) AS k` into a form
-- that lets the null row slip through with k=0 (default). Keeping the column
-- Nullable + `allow_nullable_key=1` matches the repo_weekly_rollup pattern
-- (`repo_id_hash Nullable(String)` on the key) and preserves the null-row
-- filter at MV-write time. Read paths group by pr_number and filter with
-- `WHERE pr_number IS NOT NULL`.
CREATE MATERIALIZED VIEW IF NOT EXISTS pr_outcome_rollup
ENGINE = AggregatingMergeTree
ORDER BY (org_id, repo, pr_number, day)
PARTITION BY toYYYYMM(day)
SETTINGS allow_nullable_key = 1
POPULATE AS SELECT
  org_id,
  coalesce(repo_id_hash, '')                              AS repo,
  pr_number                                               AS pr_number,
  toDate(ts, 'UTC')                                       AS day,
  sumState(cost_usd)                                      AS cost_usd_state,
  sumState(toUInt64(input_tokens))                        AS input_tokens_state,
  sumState(toUInt64(output_tokens))                       AS output_tokens_state,
  countIfState(
    event_kind = 'code_edit_decision'
    AND edit_decision = 'accept'
    AND hunk_sha256 IS NOT NULL
  )                                                       AS accepted_edit_count_state,
  sumState(toUInt64(coalesce(revert_within_24h, 0)))      AS revert_count_state,
  maxState(
    toUInt8(event_kind = 'code_edit_decision' AND edit_decision = 'accept')
  )                                                       AS ai_assisted_flag_state,
  uniqState(engineer_id)                                  AS contributors_state,
  minState(ts)                                            AS first_ts_state,
  maxState(ts)                                            AS last_ts_state,
  quantileState(0.95)(toUInt64(duration_ms))              AS duration_ms_p95_state
FROM events
WHERE pr_number IS NOT NULL
GROUP BY org_id, repo, pr_number, day;
