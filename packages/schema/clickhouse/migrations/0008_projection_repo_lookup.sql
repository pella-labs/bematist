-- D1-03: repo_lookup projection on events. Covers repo-drill queries
-- that filter by (org_id, repo_id_hash). Additive — does not change the
-- primary ORDER BY (contract 09 invariant 1).
-- Production deploys should schedule MATERIALIZE during a maintenance window;
-- CH back-populates the projection from existing rows synchronously.
--
-- `deduplicate_merge_projection_mode='rebuild'`: required because `events` is
-- ReplacingMergeTree. Safe here because Redis SETNX is authoritative dedupe
-- (contract 09 invariant 2); RMT merges are a safety net. `rebuild` keeps the
-- projection in sync with deduplicated data.
ALTER TABLE events MODIFY SETTING deduplicate_merge_projection_mode = 'rebuild';

ALTER TABLE events ADD PROJECTION IF NOT EXISTS repo_lookup (
  SELECT *
  ORDER BY (org_id, repo_id_hash, ts)
);
ALTER TABLE events MATERIALIZE PROJECTION repo_lookup;
