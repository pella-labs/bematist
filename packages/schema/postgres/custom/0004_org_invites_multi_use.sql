-- 0004_org_invites_multi_use.sql
-- Make org_invites multi-use.
--
-- Before: `accepted_by_user_id` + `accepted_at` implicitly single-use (the
-- accept path required them to be null).
-- After: `max_uses` caps acceptance (NULL = unlimited), `uses` counter
-- increments atomically. The legacy `accepted_*` columns stay for
-- first-accept audit trail and are populated on the FIRST accept only.
--
-- Rollback is a single-command drop; legacy columns are untouched so any
-- pre-existing code that reads them still works.

ALTER TABLE "org_invites"
  ADD COLUMN IF NOT EXISTS "max_uses" int DEFAULT NULL;

ALTER TABLE "org_invites"
  ADD COLUMN IF NOT EXISTS "uses" int NOT NULL DEFAULT 0;
