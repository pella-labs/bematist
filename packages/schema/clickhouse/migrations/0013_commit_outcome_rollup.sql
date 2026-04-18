-- M3 follow-up #4: per-commit outcome rollup. Sibling of pr_outcome_rollup
-- keyed at commit granularity. Per CLAUDE.md §8.5 commits carry attribution
-- via the denormalized `commit_sha` column on events, which the GitHub App
-- `push` webhook sets (trailer-parsed sessionId → commit) or the git-log
-- fallback writer assigns at webhook-ingest time.
--
-- Grouping on (org_id, repo, commit_sha, day) keeps the partition shape
-- aligned with the events partition-drop path (D15). A commit landing on a
-- UTC day boundary splits into two rows; query-time *Merge folds them back.
--
-- `author_engineer_id_hash` is the 8-char hex of cityHash64(engineer_id) —
-- rendered to the dashboard when the IC has not opted into naming. Agent
-- events carry engineer_id already; the hash is derived in the GROUP BY
-- expression so the MV never stores a raw engineer_id alongside the commit.
--
-- State columns use AggregateFunction:
--   - cost_usd_attributed_state   sumState(cost_usd) — every agent LLM call
--                                 whose session led to this commit
--   - duration_ms_p95_state       quantileState(0.95)(duration_ms)
--   - ai_assisted_flag_state      maxState(1 if at least one accept landed)
--   - revert_count_state          sumState(coalesce(revert_within_24h,0))
--   - first_ts_state / last_ts_state  min/maxState(ts)
--   - pr_number_any_state         any(pr_number) — commits usually carry a
--                                 single PR; `any` resolves the rare merge/
--                                 cherry-pick case where the same sha is
--                                 attributed to different PRs across days.
-- commit_sha stays Nullable(String) in the key — same CH 25+ optimizer quirk
-- as pr_outcome_rollup (see neighbouring migration). `allow_nullable_key=1`
-- matches repo_weekly_rollup; the MV's `WHERE commit_sha IS NOT NULL` keeps
-- null-sha rows out at write time, and read paths filter by `commit_sha IS
-- NOT NULL` defensively.
CREATE MATERIALIZED VIEW IF NOT EXISTS commit_outcome_rollup
ENGINE = AggregatingMergeTree
ORDER BY (org_id, repo, commit_sha, day)
PARTITION BY toYYYYMM(day)
SETTINGS allow_nullable_key = 1
POPULATE AS SELECT
  org_id,
  coalesce(repo_id_hash, '')                              AS repo,
  commit_sha                                              AS commit_sha,
  substring(lower(hex(cityHash64(engineer_id))), 1, 8)    AS author_engineer_id_hash,
  toDate(ts, 'UTC')                                       AS day,
  sumState(cost_usd)                                      AS cost_usd_attributed_state,
  quantileState(0.95)(toUInt64(duration_ms))              AS duration_ms_p95_state,
  maxState(
    toUInt8(event_kind = 'code_edit_decision' AND edit_decision = 'accept')
  )                                                       AS ai_assisted_flag_state,
  sumState(toUInt64(coalesce(revert_within_24h, 0)))      AS revert_count_state,
  minState(ts)                                            AS first_ts_state,
  maxState(ts)                                            AS last_ts_state,
  anyState(pr_number)                                     AS pr_number_any_state
FROM events
WHERE commit_sha IS NOT NULL
GROUP BY org_id, repo, commit_sha, author_engineer_id_hash, day;
