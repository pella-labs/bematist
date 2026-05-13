# Handoff — SOC 2 audit-log + role-check helpers

**Branch:** `feat/compliance-soc2`
**Plan:** [`2026-05-05-audit-log-and-role-wrappers.md`](./2026-05-05-audit-log-and-role-wrappers.md)
**Last activity:** 2026-05-13

## Status snapshot

| Phase | Status |
|---|---|
| Task 1 — `audit_log` table | ✅ committed |
| Task 2 — `extractRequestMeta` + `AuditEvent` types | ✅ committed |
| Task 3 — `logAudit` (swallow-on-failure) | ✅ committed |
| Task 4 — `requireSession` helper | ✅ committed |
| Task 5 — `requireManager` helper | ✅ committed (hardened after self-review) |
| Task 6 — migrate `/api/membership/role` + emit `role.change` | ✅ committed |
| Task 7 — migrate `/api/invite` + emit `invite.send` | ✅ committed |
| Task 8 — migrate `/api/tokens` + emit `token.create` | ✅ committed |
| Task 9.1 — full repo typecheck | ✅ clean (3/3 workspaces) |
| Task 9.2 — full repo tests | ✅ web 46/46 pass (incl. 19 new). ⚠️ See "Known noise" |
| Task 9.3 — `bun --filter='./apps/web' run build` | ✅ green; all migrated routes compile |
| Task 9.4 — manual smoke (UI + Drizzle Studio) | ⏳ **NOT DONE** — needs human |
| Task 9.5 — verify `/org/<slug>/members` still renders history | ⏳ **NOT DONE** — needs human |
| Task 9.6 — fixup commit if smoke catches anything | ⏳ pending 9.4 outcome |

## What ships on this branch

1. New table `audit_log` (Postgres) with three indexes (org+time, actor+time, action+time). Applied to local DB via `bun run db:push`.
2. `apps/web/lib/audit.ts` — `logAudit()`, `extractRequestMeta()`, `AuditAction` union.
3. `apps/web/lib/route-helpers.ts` — `requireSession()`, `requireManager()` (return resolved context or short-circuit `NextResponse` error).
4. Three privileged routes migrated to the helpers and emitting audit events:
   - `POST /api/membership/role` → `role.change` (dual-writes `membership_audit` to keep `/org/<slug>/members` history intact).
   - `POST /api/invite` → `invite.send`.
   - `POST /api/tokens` → `token.create`.
5. **19 new tests**: `lib/__tests__/audit.test.ts` (7), `lib/__tests__/route-helpers.test.ts` (6), and 2 route regression tests each under `app/api/{membership/role,invite,tokens}/__tests__/`.

## Commits on this branch (oldest → newest)

```
2398dee gitignore SOC2_RESEARCH.md for local compliance scoping notes
89a9da0 add SOC 2 plan A: audit_log table and shared role-check helpers
baf3c2c feat(web): add audit_log table for privileged-action tracking
2754f95 feat(web): add extractRequestMeta + AuditEvent types
6b56505 feat(web): add logAudit with swallow-on-failure semantics
740b3e5 feat(web): add requireSession route helper
77c7870 feat(web): add requireManager route helper
9fd42ea refactor(web): harden requireManager API per code-review feedback
4056ab3 docs(plan): sync Step 5.1 + 5.3 snippets with hardened requireManager API
e35b47c feat(web): wire /api/membership/role through requireManager + audit_log
b98935f fix(web): harden membership/role migration, propagate to plan
b99f2a6 feat(web): wire /api/invite through requireManager + audit_log
fa72206 feat(web): wire /api/tokens through requireSession + audit_log
9386db7 chore: dedup test import and correct plan footer test count
3de9185 chore(web): drop bash-only PORT substitution from dev script
```

## Known noise (NOT this branch's fault)

- `apps/collector/src/__tests__/cursor.test.ts > buildCursorSessionState > decodes file:// URIs and includes newlyCreatedFiles in filesEdited` fails on this branch **and** on `main`. Introduced by `72ff3ed feat(collector): cursor adapter (#118)`. Worth fixing in a separate branch — has nothing to do with SOC 2.

## To resume

1. `git checkout feat/compliance-soc2 && git pull`
2. Re-confirm green automated checks (fast):
   ```bash
   bun run typecheck
   bun --filter='./apps/web' run test
   bun --filter='./apps/web' run build
   ```
3. Do the **manual smoke** (Task 9.4 / 9.5 in the plan):
   - `bun run dev`, sign in as a manager.
   - `/org/<slug>/members` → promote a dev → open `bun run db:studio`, confirm one new `audit_log` row, `action="role.change"`, `metadata` has `{fromRole, toRole}`, and `target_id` = promoted user id.
   - Send an invite → expect one `audit_log` row, `action="invite.send"`.
   - Mint a token at `/setup/collector` → expect one `audit_log` row, `action="token.create"`.
   - `/org/<slug>/members` "role change history" still renders (sourced from `membership_audit` dual-write — Task 6).
4. If smoke surfaces anything, fix + commit per Task 9.6 template in the plan. Otherwise, open the PR.

## After this branch lands

Follow-ups deliberately out of scope (see plan's "What does NOT ship" section):

- `/org/[slug]/audit` page reading from `audit_log`, then cutover of `members/page.tsx` off `membership_audit` and removal of the Task 6 dual-write.
- Migrate the other non-manager-only privileged routes (`/api/github-app/install`, `/api/orgs`, `/api/invite/accept`) — needs new `AuditAction` names.
- `DELETE /api/tokens/:id` revocation route + `token.revoke` event.

## Files of interest

- Plan: `docs/superpowers/plans/2026-05-05-audit-log-and-role-wrappers.md`
- Schema: `apps/web/lib/db/schema.ts` (look for `auditLog`)
- Helpers: `apps/web/lib/audit.ts`, `apps/web/lib/route-helpers.ts`
- Routes touched: `apps/web/app/api/membership/role/route.ts`, `apps/web/app/api/invite/route.ts`, `apps/web/app/api/tokens/route.ts`
- Local-only research notes (gitignored): `SOC2_RESEARCH.md`
