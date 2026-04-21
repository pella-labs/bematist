# D1-06 Primer: RLS on every org-scoped table + INT9 cross-tenant probe

**For:** Fresh session enforcing tenant isolation
**Project:** bema (DevMetrics)
**Workstream:** D (Storage & Schema)
**Date:** 2026-04-17 (planned)
**Previous work:** `D1-05` (control-plane tables). Hard-blocks this ticket. See `docs/DEVLOG.md`.

---

## What Is This Ticket?

Enable Postgres Row-Level Security on every org-scoped table from `D1-05`, with a single `org_isolation` policy that filters by `current_setting('app.current_org_id')::text`. Add the INT9 adversarial cross-tenant probe — attempts cross-tenant queries with each RBAC role's token; must return 0 rows. **Merge-blocker** per CLAUDE.md Security Rules and contract 09 invariant 4.

### Why It Matters

- **Regulatory must-have:** GDPR + SOC 2 require tenant isolation; RLS is the PG-native enforcement.
- **Challenger threat #3:** without RLS, a single bug in app code (forgotten WHERE clause) leaks cross-tenant data.
- **INT9 is a MERGE BLOCKER** — the adversarial probe must return 0 rows or CI fails.
- Downstream workstreams (C ingest, E dashboard) assume RLS is on; they `SET app.current_org_id` before queries without checking.

---

## What Was Already Done

- `D1-05` landed 13 control-plane tables, all with `org_id` columns.
- `orgs` is NOT org-scoped (it IS the org table) — exempt from RLS.
- `users` — scoped by `org_id` column.
- `developers` — scoped by `org_id` column.
- `audit_log` — immutable; RLS on reads only.

---

## What This Ticket Must Accomplish

### Goal

Every org-scoped PG table enforces RLS; INT9 adversarial probe green in CI.

### Deliverables Checklist

#### A. Implementation

- [ ] `packages/schema/postgres/rls.sql` — single migration that:
  ```sql
  -- Pattern applied to every org-scoped table
  ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
  ALTER TABLE <table> FORCE ROW LEVEL SECURITY;  -- no bypass even by table owner
  CREATE POLICY org_isolation ON <table>
    USING (org_id = current_setting('app.current_org_id', true)::uuid);
  ```
  Tables to enable: `users`, `developers`, `repos`, `policies`, `git_events`, `ingest_keys`, `prompt_clusters`, `playbooks`, `audit_log`, `audit_events`, `erasure_requests`, `alerts`, `insights`, `outcomes`, `embedding_cache`. (Not `orgs`.)
- [ ] `packages/schema/postgres/rls_set_org.ts` — helper `withOrg(orgId, fn)`:
  ```ts
  export async function withOrg<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL app.current_org_id = ${orgId}`);
      return fn();
    });
  }
  ```
- [ ] Update Drizzle `db` connection pool to always require a session-scoped `app.current_org_id` before any org-scoped query — or enforce via the helper above + code review.
- [ ] Add `app` role for the ingest / dashboard / worker apps with `NOBYPASSRLS` — only the `postgres` superuser can bypass.

#### B. Tests (INT9 adversarial)

- [ ] `packages/schema/postgres/__tests__/rls_cross_tenant.test.ts`:
  - Seed two orgs with data in each of the 15 tables.
  - Set `app.current_org_id` to org A; for each table, assert `SELECT COUNT(*) WHERE org_id = <orgB>` returns 0.
  - Test each RBAC role (`admin`, `manager`, `engineer`, `auditor`, `viewer`) — all must return 0.
  - Test the ingest key path: a different org's bearer token can't read this org's rows.
- [ ] Property test: random `SELECT` across any table in any role without setting `app.current_org_id` returns 0 rows (RLS default-deny).
- [ ] Regression test: setting `app.current_org_id = '<orgA>'` returns ONLY `orgA` rows — full-tenant visibility for the scoped org.
- [ ] INT9 CI wiring: merge-blocker label; GH Actions step that runs just this test and fails the PR if any table returns cross-tenant rows.

#### C. Integration Expectations

- [ ] Every app-side query must use `withOrg(…)` — document in `packages/schema/README.md` + enforce via code review.
- [ ] Ingest server (Workstream C) sets `app.current_org_id` from JWT before any query. Contract 02 §Auth references this — no contract change, but note in PR.
- [ ] The INT9 probe becomes the permanent regression test — any future table addition must include the ALTER + CREATE POLICY.

#### D. Documentation

- [ ] DEVLOG entry
- [ ] Tickets README ✅
- [ ] Contract 09 changelog: "RLS enforced on all org-scoped tables via migration 000X; INT9 merge-blocker active."
- [ ] Update `contracts/09-storage-schema.md` §Postgres if the RLS rule pattern needs clarification

---

## Branch & Merge Workflow

```bash
git switch main && git pull
git switch -c D1-06-rls-int9-probe-jorge

# TDD: write INT9 probe first, watch it fail on current RLS-less state, then land RLS to pass

bun run lint && bun run typecheck && bun run test

git push -u origin D1-06-rls-int9-probe-jorge
gh pr create --base main \
  --title "feat(schema): RLS + INT9 cross-tenant probe (D1-06) — MERGE BLOCKER" \
  --body "Refs #3"
```

---

## Important Context

### Files to Create

| File | Why |
|------|-----|
| `packages/schema/postgres/migrations/0002_rls.sql` | RLS ALTERs + policies |
| `packages/schema/postgres/rls_set_org.ts` | `withOrg` helper |
| `packages/schema/postgres/__tests__/rls_cross_tenant.test.ts` | INT9 probe |
| `.github/workflows/int9.yml` | CI job (or add step to `ci.yml`) |

### Files to Modify

| File | Action |
|------|--------|
| `packages/schema/postgres/schema.ts` | Document RLS assumptions at top of file |
| `contracts/09-storage-schema.md` | Changelog |
| `docs/DEVLOG.md` | Append |
| `docs/tickets/README.md` | ✅ |
| `apps/ingest/src/auth.ts` (IF it has DB touch) | Call `withOrg(…)` pattern |

### Files You Should NOT Modify

- Business logic in other workstreams — they MUST adopt `withOrg(…)`; coordinate via contract update
- `orgs` table (not org-scoped itself)

### Files You Should READ for Context

| File | Why |
|------|-----|
| `CLAUDE.md` "Security Rules" + "Database Rules" | Authoritative rules |
| `dev-docs/PRD.md` §5.3, D8 | RLS decision refs |
| `contracts/09-storage-schema.md` §RLS rule + Inv. 4 | Policy pattern |
| `contracts/02-ingest-api.md` §Auth | Where `app.current_org_id` gets set |
| `contracts/07-manager-api.md` §Authz + INT9 reference | Consumer expectations |

---

## Architectural Decisions

| Decision | Reference | Summary |
|----------|-----------|---------|
| RLS default-deny | CLAUDE.md | Any unscoped query returns 0 — safer than default-allow. |
| `FORCE ROW LEVEL SECURITY` | PG docs | Prevents table owner (postgres role) from bypassing accidentally. |
| Setting scope | — | `SET LOCAL` inside a transaction; releases on commit. |
| App role | — | `NOBYPASSRLS` — only `postgres` superuser bypasses, used for migrations only. |

---

## Suggested Implementation Pattern

```sql
-- packages/schema/postgres/migrations/0002_rls.sql
-- Apply to all org-scoped tables
CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid AS $$
  SELECT current_setting('app.current_org_id', true)::uuid
$$ LANGUAGE sql STABLE;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'users', 'developers', 'repos', 'policies', 'git_events',
      'ingest_keys', 'prompt_clusters', 'playbooks', 'audit_log',
      'audit_events', 'erasure_requests', 'alerts', 'insights',
      'outcomes', 'embedding_cache'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY org_isolation ON %I USING (org_id = app_current_org())', t);
  END LOOP;
END $$;
```

---

## Edge Cases to Handle

1. **Unset `app.current_org_id`.** Default-deny — `app_current_org()` returns NULL, policy evaluates `org_id = NULL` = NULL (falsy), no rows returned. Test this.
2. **Multi-tenant query in a single txn.** `SET LOCAL` is transaction-scoped. If code needs two orgs in one txn, the pattern is: two separate txns. Flag in `withOrg` docstring.
3. **Superuser bypass.** Migrations run as `postgres`, which bypasses RLS. Document that app code NEVER connects as superuser.
4. **`audit_log` role-based access.** Auditor role reads across tenants — handled by `SET ROLE auditor` pattern + separate policy. Out of scope for this ticket; add when Workstream I needs it.
5. **Missing `org_id` column.** If a future table has no `org_id` and still needs tenant isolation, the policy needs a join — document in migration comments.

---

## Definition of Done

- [ ] RLS enabled + forced on all 15 org-scoped tables
- [ ] `withOrg` helper + pattern adopted
- [ ] INT9 probe green in CI
- [ ] Regression test (in-scope queries return rows; out-of-scope return 0)
- [ ] Property test covers all 15 tables × all 5 roles = 75 assertions minimum
- [ ] `bun run test` / `typecheck` / `lint` green
- [ ] Contract 09 changelog
- [ ] DEVLOG entry
- [ ] Tickets README ✅
- [ ] Branch pushed, PR `Refs #3` — **merge blocker**

---

## Estimated Time

| Task | Estimate |
|------|----------|
| INT9 probe (TDD) — write first, watch fail | 90 min |
| RLS migration | 45 min |
| `withOrg` helper | 30 min |
| Multi-role tests | 90 min |
| CI wiring + merge-blocker label | 30 min |
| Docs + DEVLOG | 15 min |

~5 h.

---

## After This Ticket: What Comes Next

- **D1-07** (Plan B sidecar) — unrelated to RLS; parallel-safe.
- Unblocks Workstream C (ingest) — they can now write to PG knowing RLS is enforced.
- Unblocks M1 merge checkpoint — RLS + INT9 are M1 gates.
