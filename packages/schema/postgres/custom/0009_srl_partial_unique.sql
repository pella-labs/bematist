-- ============================================================================
-- 0009_srl_partial_unique.sql — B5 fix
-- ============================================================================
-- The G1 migration created a plain unique index per partition on
-- (tenant_id, session_id, repo_id_hash, match_reason). That shape blocks a
-- second `writeLinkerState` call from inserting a fresh link row — the
-- writer marks the old row `stale_at=now()` but the unique index still
-- treats the (tenant, session, repo_hash, match_reason) tuple as taken, so
-- the INSERT-WHERE-NOT-EXISTS guard finds the staled row and skips.
--
-- Fix: make uniqueness partial on `stale_at IS NULL`. Stale rows are now
-- append-only history; only one active row per PK tuple at any time.
--
-- The writer's WHERE NOT EXISTS clause is updated in the same commit to
-- filter on `stale_at IS NULL` — without that, the partial index would let
-- a double-active row slip in under race conditions.
--
-- `apps/worker/src/github-linker/partitionCreator.ts` is updated in the
-- same commit to apply the new index shape to future monthly partitions.
-- ============================================================================

DROP INDEX IF EXISTS "srl_2026_04_unique_idx";
DROP INDEX IF EXISTS "srl_2026_05_unique_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "srl_2026_04_active_unique_idx"
  ON "session_repo_links_2026_04" ("tenant_id", "session_id", "repo_id_hash", "match_reason")
  WHERE "stale_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "srl_2026_05_active_unique_idx"
  ON "session_repo_links_2026_05" ("tenant_id", "session_id", "repo_id_hash", "match_reason")
  WHERE "stale_at" IS NULL;
