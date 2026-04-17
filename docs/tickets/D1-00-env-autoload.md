# D1-00 Primer: Dev env autoload + per-dev compose override

**For:** Fresh session needing to understand the env plumbing already in place
**Project:** bematist (DevMetrics)
**Workstream:** D (Storage & Schema) — setup only, no storage surface affected
**Date:** 2026-04-17
**Status:** ✅ committed to local branch `dev-env-autoload-compose-override-jorge`; push blocked pending collaborator grant
**Previous work:** M0 Sprint-0 scaffolding (commit `1861bc1`). See `docs/DEVLOG.md`.

---

## What Is This Ticket?

Ergonomic floor for local development. Root `package.json` scripts now auto-load `.env` via Bun's `--env-file=.env` flag so filtered subprocesses (`bun --filter=...`) inherit env vars without per-invocation `DATABASE_URL=... bun run ...` prefixing. Also introduces `docker-compose.*.local.yml` as a gitignored per-dev override pattern for machines where the default host ports collide with other projects.

### Why It Matters

- Without this, every `bun run db:migrate:pg` on a fresh shell errors out with "database bematist does not exist" because the fallback URL points at port 5433 (held by other projects on Jorge's machine).
- Sets the floor for every subsequent ticket — Sprint 1 phases 02+ all rely on `bun run db:migrate:*` working without ceremony.
- Keeps the tracked `docker-compose.dev.yml` at upstream defaults so other workstreams aren't affected.

---

## What Was Already Done

- Sprint-0 M0 scaffolded the monorepo (`1861bc1`): `apps/{collector,ingest,web,worker}`, `packages/{schema,sdk,api,otel,ui,redact,embed,scoring,clio,fixtures,config}`, contracts, docker-compose, CI.
- M0 migrations applied: CH `events` (42 cols, `ReplacingMergeTree(ts)`), PG `orgs`/`users`/`developers`.
- `.env.example` present with every documented variable.

---

## What This Ticket Must Accomplish

### Goal

Running `bun run db:migrate:pg` (and all other scripts) should work from a fresh shell without any env-var prefixing or `source .env` dance.

### Deliverables Checklist

#### A. Implementation

- [x] `package.json`: prepend `--env-file=.env` to `dev`, `test`, `test:e2e`, `db:migrate:pg`, `db:migrate:ch`, `db:seed`
- [x] `.gitignore`: exclude `docker-compose.*.local.yml`
- [x] `README.md`: document the per-dev compose override pattern + env auto-loading in Quickstart

#### B. Tests

- [x] `bun run db:migrate:pg` clean on fresh shell (no prefix)
- [x] `bun run db:migrate:ch` clean
- [x] `bun run test` — 22/22 pass
- [x] `bun run typecheck` — 15 workspaces clean
- [x] `bun run lint` — 68 files clean

#### C. Integration Expectations

- [x] CI unaffected (no changes to `.github/workflows/ci.yml`)
- [x] Tracked `docker-compose.dev.yml` unchanged — only the gitignored local override carries per-dev port remaps

#### D. Documentation

- [x] `docs/DEVLOG.md` entry (see 2026-04-17 section)
- [x] `docs/tickets/README.md` status: ✅ committed (push blocked)

---

## Branch & Merge Workflow

Branch: `dev-env-autoload-compose-override-jorge` (pre-dates the `D1-*` numbering; kept as-is)

```bash
# local branch already committed; waiting on push access
git push -u origin dev-env-autoload-compose-override-jorge
gh pr create --base main \
  --title "chore: auto-load .env across scripts + per-dev compose override" \
  --body "Refs #3"
```

---

## Important Context

### Files Modified

| File | Action |
|------|--------|
| `package.json` | Added `--env-file=.env` to 6 scripts |
| `.gitignore` | Added `docker-compose.*.local.yml` |
| `README.md` | Quickstart + "Per-dev port overrides" section |

### Files Created (local only, gitignored)

| File | Why |
|------|-----|
| `.env` | Local secrets; port remaps 5435/6381 |
| `docker-compose.dev.local.yml` | Port overrides for Jorge's machine |

---

## Architectural Decisions

| Decision | Reference | Summary |
|----------|-----------|---------|
| Auto-load strategy | — | `bun --env-file=.env` silently no-ops on missing file, so upstream defaults still work for fresh clones. No `dotenv` dep needed. |
| Compose override pattern | — | Gitignored `docker-compose.*.local.yml` merged on invocation via `-f`. Avoids per-dev forks of the tracked compose file. |

---

## Definition of Done

- [x] All deliverables checked
- [x] Tests / typecheck / lint green
- [x] Committed to local branch
- [ ] Push + PR opened (blocked on repo collaborator grant)
- [x] DEVLOG entry
- [x] This primer written

---

## After This Ticket: What Comes Next

- **D1-01** (contract 05 drift fix) is the next small-win — prep for downstream consumers.
- **D1-02** (materialized views) is the first substantive storage work.
