-- 90-day retroactive PR + commit backfill progress tracking.
--
-- One row per (tenant_id, installation_id, provider_repo_id, kind). The
-- history backfill worker walks every tracked repo on an installation and
-- paginates `GET /repos/.../pulls` + `GET /repos/.../commits`. One row
-- per (repo, kind) lets a killed worker resume per-repo + per-kind without
-- clobbering progress for the other combination. Mirrors the shape of
-- custom/0007_github_sync_progress.sql (whole-installation progress) but
-- is keyed at the repo+kind level because each repo has independent
-- pagination cursors.
--
-- RLS via the `org_isolation` convention used across §9.10 tables.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS "github_history_sync_progress" (
  "tenant_id"          uuid        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  "installation_id"    bigint      NOT NULL,
  "provider_repo_id"   varchar(32) NOT NULL,
  "kind"               text        NOT NULL
                         CHECK (kind IN ('pulls','commits')),
  "status"             text        NOT NULL
                         CHECK (status IN ('queued','running','completed','failed','cancelled')),
  "since_ts"           timestamptz NOT NULL,
  "next_page_cursor"   text        NULL,
  "fetched"            integer     NOT NULL DEFAULT 0,
  "pages_fetched"      integer     NOT NULL DEFAULT 0,
  "started_at"         timestamptz NULL,
  "completed_at"       timestamptz NULL,
  "last_progress_at"   timestamptz NOT NULL DEFAULT now(),
  "last_error"         text        NULL,
  "retry_count"        integer     NOT NULL DEFAULT 0,
  "requested_by"       uuid        NULL REFERENCES users(id) ON DELETE SET NULL,
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  "updated_at"         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, installation_id, provider_repo_id, kind)
);

CREATE INDEX IF NOT EXISTS "gh_hist_status_idx"
  ON "github_history_sync_progress" ("status", "last_progress_at" DESC);

CREATE INDEX IF NOT EXISTS "gh_hist_tenant_install_idx"
  ON "github_history_sync_progress" ("tenant_id", "installation_id", "status");

ALTER TABLE "github_history_sync_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "github_history_sync_progress" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON "github_history_sync_progress";
CREATE POLICY org_isolation ON "github_history_sync_progress"
  USING (tenant_id = app_current_org())
  WITH CHECK (tenant_id = app_current_org());
GRANT SELECT, INSERT, UPDATE, DELETE ON "github_history_sync_progress" TO app_bematist;
