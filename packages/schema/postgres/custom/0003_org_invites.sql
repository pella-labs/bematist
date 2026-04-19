-- 0003_org_invites.sql
-- Invite-link flow for simplified onboarding (tonight's cutover from Tailscale).
--
-- An admin of an org creates an invite (optionally single-use, optionally
-- role-scoped). The resulting opaque token is shared via a /join/<token> URL.
-- On acceptance, the invitee is attached to the org at the role pinned on
-- the invite.
--
-- RLS: org-scoped like every other tenant table. App code never bypasses.

CREATE TABLE IF NOT EXISTS "org_invites" (
  "id"                  uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id"              uuid        NOT NULL REFERENCES orgs(id),
  "token"               text        NOT NULL UNIQUE,
  "role"                text        NOT NULL DEFAULT 'ic',
  "created_by"          uuid        REFERENCES users(id),
  "expires_at"          timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  "accepted_by_user_id" uuid        REFERENCES users(id),
  "accepted_at"         timestamptz,
  "revoked_at"          timestamptz,
  "created_at"          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_invites_org_id_idx ON org_invites(org_id);
CREATE INDEX IF NOT EXISTS org_invites_token_idx  ON org_invites(token);

ALTER TABLE "org_invites" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS org_isolation ON org_invites;
  CREATE POLICY org_isolation ON org_invites
    USING (org_id::text = current_setting('app.current_org_id', true));
EXCEPTION
  WHEN undefined_object THEN null;
END $$;
