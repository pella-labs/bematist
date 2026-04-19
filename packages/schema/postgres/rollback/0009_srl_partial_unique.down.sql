-- Rollback for 0009_srl_partial_unique.sql — restore plain unique shape.
-- If partial-index rows have drifted to the point where a plain unique
-- can't be restored (two active rows per PK tuple), the rollback will
-- fail loudly and the operator must reconcile manually.

DROP INDEX IF EXISTS "srl_2026_04_active_unique_idx";
DROP INDEX IF EXISTS "srl_2026_05_active_unique_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "srl_2026_04_unique_idx"
  ON "session_repo_links_2026_04" ("tenant_id", "session_id", "repo_id_hash", "match_reason");
CREATE UNIQUE INDEX IF NOT EXISTS "srl_2026_05_unique_idx"
  ON "session_repo_links_2026_05" ("tenant_id", "session_id", "repo_id_hash", "match_reason");
