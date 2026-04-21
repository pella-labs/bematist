# D1-02 Primer: ClickHouse materialized views (5 MVs)

**For:** Fresh session implementing the Sprint 1 MV suite
**Project:** bema (DevMetrics)
**Workstream:** D (Storage & Schema) — primary author; H and E are consumers
**Date:** 2026-04-17
**Previous work:** `D1-00` env autoload, `D1-01` contract 05 drift. See `docs/DEVLOG.md`.

---

## What Is This Ticket?

Five materialized views on ClickHouse `events` that pre-aggregate the read paths every downstream workstream depends on. Without these MVs, dashboard queries scan raw `events` at ~8M rows/day and blow past the p95 <2s SLA; scoring inputs become pull-at-read-time instead of pull-at-write-time; Twin Finder has no per-session cluster assignment table to join against.

### Why It Matters

- **Scoring math (Workstream H, contract 04):** `dev_daily_rollup` feeds every per-engineer score; `team_weekly_rollup` feeds team-level tiles and the 2×2.
- **Dashboard (Workstream E, contract 07):** all manager-facing queries read MVs, not raw events. p95 <2s gate depends on this.
- **Twin Finder + playbook adoption (D31):** `cluster_assignment_mv` is the join key between a session and its prompt cluster.
- **Performance gate (INT11):** MVs are the primary mechanism for hitting p95 dashboard <2s with 1M seeded events.

---

## What Was Already Done

- `events` table exists (`packages/schema/clickhouse/migrations/0001_events.sql`) with 42 cols, `ReplacingMergeTree(ts)`, `PARTITION BY (toYYYYMM(ts), cityHash64(org_id) % 16)`, `ORDER BY (org_id, ts, engineer_id)`.
- Schema is locked at PRD §5.3 — do not modify `events` shape in this ticket; add columns via separate additive PR if absolutely needed.
- `contracts/09-storage-schema.md` §Materialized views names all five MVs + purpose.

---

## What This Ticket Must Accomplish

### Goal

Five `MATERIALIZED VIEW` definitions landed as ClickHouse migrations, populating from `events` at write time, with a seed script proving they roll up correctly against a synthetic 10k-event fixture.

### Deliverables Checklist

#### A. Implementation

- [ ] `packages/schema/clickhouse/migrations/0002_dev_daily_rollup.sql` — per (org_id, engineer_id, toDate(ts)) aggregates:
  - `input_tokens_sum`, `output_tokens_sum`, `cost_usd_sum`, `sessions_count` (uniqState over session_id), `accepted_edits` (countState where `event_kind='code_edit_decision' AND edit_decision='accept'`), `active_seconds` (session-derived)
- [ ] `packages/schema/clickhouse/migrations/0003_team_weekly_rollup.sql` — per (org_id, team_id, toMonday(ts)) — **NOTE:** `team_id` column doesn't exist on `events` yet; derive via join against PG `developers.team_id` mirror OR gate this MV on a follow-up column addition. Decide during brainstorm; document the choice in the migration comment.
- [ ] `packages/schema/clickhouse/migrations/0004_prompt_cluster_stats.sql` — per (org_id, cluster_id, toMonday(ts)) aggregates: prompt count, contributing engineers (uniqState over engineer_id, k≥3 floor enforced at read), avg cost.
- [ ] `packages/schema/clickhouse/migrations/0005_repo_weekly_rollup.sql` — per (org_id, repo_id_hash, toMonday(ts)) aggregates matching contract 09 §MVs row.
- [ ] `packages/schema/clickhouse/migrations/0006_cluster_assignment_mv.sql` — per (org_id, session_id, prompt_index) → cluster_id — the join table Twin Finder and playbook adoption read.
- [ ] `packages/schema/scripts/seed.ts` — generate a synthetic 10k-event fixture (3 orgs, 12 engineers, 200 sessions, spread over 30d) and `INSERT` into `events`. Wire `bun run db:seed`.

#### B. Tests

- [ ] Test-first: write a vitest (via `bun test`) for each MV that inserts a tiny deterministic slice (~20 events) and asserts the MV row count + a handful of column sums.
- [ ] `packages/schema/clickhouse/__tests__/mv_dev_daily.test.ts` etc. — one file per MV.
- [ ] Property test: sum of `input_tokens_sum` across `dev_daily_rollup` for a window equals naive sum over raw `events` for same window (±0 tolerance).
- [ ] EXPLAIN-style test: run the headline query each MV services; assert it reads from the MV, not raw `events` (parse `EXPLAIN PIPELINE` output).
- [ ] `bun run db:seed` + a smoke query returning non-zero rows for every MV.

#### C. Integration Expectations

- [ ] Contract 09 §MVs table covers the MV names authoritatively — do not rename.
- [ ] `useful_output_v1` noise floor (D12 rule 6: sessions with `accepted_edits < 3` excluded) — document where the filter lives: my recommendation is the scoring function reads MV then filters, keeping MVs pure sums. Confirm in brainstorm.
- [ ] k≥3 contributor floor for `prompt_cluster_stats` display — enforce at read time (API layer), not at MV time. MV computes truth; API gates visibility.
- [ ] No MV writes to raw `events` — MVs are write-downstream-only.

#### D. Documentation

- [ ] Append entry to `docs/DEVLOG.md`
- [ ] Update `docs/tickets/README.md` status → ✅
- [ ] Append changelog to `contracts/09-storage-schema.md` (additive — new MVs added)

---

## Branch & Merge Workflow

```bash
git switch main && git pull
git switch -c D1-02-materialized-views-jorge

# Brainstorm first (per superpowers). Decisions to lock:
#   - AggregatingMergeTree vs SummingMergeTree for each MV
#   - UTC day boundaries vs per-org TZ
#   - team_id path (events col add vs PG mirror join)
#   - task_category — deferred to D1-02b or bundled here?

# TDD: write MV test files first, then migrations.

bun run lint && bun run typecheck && bun run test
bun run db:migrate:ch  # apply new 0002..0006

git push -u origin D1-02-materialized-views-jorge
gh pr create --base main \
  --title "feat(schema): 5 ClickHouse materialized views (Sprint 1 D1-02)" \
  --body "Refs #3"
```

---

## Important Context

### Files to Create

| File | Why |
|------|-----|
| `packages/schema/clickhouse/migrations/0002_dev_daily_rollup.sql` | Per-engineer daily aggregates (scoring input) |
| `packages/schema/clickhouse/migrations/0003_team_weekly_rollup.sql` | Team tiles + 2×2 source |
| `packages/schema/clickhouse/migrations/0004_prompt_cluster_stats.sql` | Cluster pages, Twin Finder |
| `packages/schema/clickhouse/migrations/0005_repo_weekly_rollup.sql` | Repo pages, outcome attribution |
| `packages/schema/clickhouse/migrations/0006_cluster_assignment_mv.sql` | Twin Finder join key |
| `packages/schema/scripts/seed.ts` | Deterministic synthetic fixture |
| `packages/schema/clickhouse/__tests__/mv_*.test.ts` | One test per MV |

### Files to Modify

| File | Action |
|------|--------|
| `packages/schema/package.json` | Add `"seed": "bun scripts/seed.ts"` if missing |
| `contracts/09-storage-schema.md` | Changelog line (additive) |
| `docs/DEVLOG.md` | Append entry |
| `docs/tickets/README.md` | ✅ |

### Files You Should NOT Modify

- `packages/schema/clickhouse/migrations/0001_events.sql` — events schema is locked; column additions are a separate additive-PR flow (D16 unknowns → `raw_attrs` first)
- Anything under `packages/scoring/` — scoring consumes the MVs, doesn't define them
- `apps/ingest/` — ingest writes raw events; MVs are CH-side side-effects

### Files You Should READ for Context

| File | Why |
|------|-----|
| `dev-docs/PRD.md` §5.3, §6.3 G6, §10 | Storage decisions + scale targets |
| `CLAUDE.md` "Database Rules" | Partition / TTL / MV rules |
| `contracts/09-storage-schema.md` §MVs | Authoritative MV names + purposes |
| `contracts/04-scoring-io.md` | Consumer — what scoring expects as input |
| `contracts/07-manager-api.md` | Consumer — what dashboard reads |

---

## Architectural Decisions (to brainstorm before coding)

| Topic | Options | Recommended | Reference |
|---|---|---|---|
| Engine per MV | `AggregatingMergeTree` vs `SummingMergeTree` | AMT for anything touching `uniq*`; SMT for pure sums | §5.3 |
| Day boundary | UTC `toDate(ts)` vs per-org TZ | **UTC** — per-org TZ is a Phase 2 rollup on top of UTC MVs | — |
| `team_id` source | Add col to `events` (breaking) vs CH dictionary from PG `developers` (additive) | **Dictionary** — avoids breaking events schema | D16 spirit |
| Noise-floor location | MV `WHERE` vs scoring function | **Scoring function** — keeps MVs pure | D12 |
| Cohort-normalize in MV? | Yes (embedded) vs No (scoring does it) | **No** — cohort shifts by window; scoring-time is correct | §04 |

Write these into the migration SQL comments so future readers see the rationale inline.

---

## Suggested Implementation Pattern

```sql
-- 0002_dev_daily_rollup.sql
CREATE MATERIALIZED VIEW dev_daily_rollup
ENGINE = AggregatingMergeTree
ORDER BY (org_id, engineer_id, day)
PARTITION BY toYYYYMM(day)
POPULATE
AS SELECT
  org_id,
  engineer_id,
  toDate(ts, 'UTC')                                AS day,
  sumState(input_tokens)                           AS input_tokens_state,
  sumState(output_tokens)                          AS output_tokens_state,
  sumState(cost_usd)                               AS cost_usd_state,
  uniqState(session_id)                            AS sessions_state,
  countIfState(event_kind = 'code_edit_decision'
               AND edit_decision = 'accept')       AS accepted_edits_state,
  minState(ts)                                     AS first_ts,
  maxState(ts)                                     AS last_ts
FROM events
GROUP BY org_id, engineer_id, day;
```

Readers use `-Merge` finalizers:

```sql
SELECT sumMerge(input_tokens_state) AS input_tokens
FROM dev_daily_rollup
WHERE org_id = {org:String} AND day >= today() - 30
GROUP BY engineer_id;
```

---

## Edge Cases to Handle

1. **Backfill of historical events.** `POPULATE` handles initial backfill only for rows at CREATE time. Document that any late-arriving Tier-C migration into this table must either refresh MVs manually or use `FREEZE/ATTACH PARTITION`.
2. **`schema_version` drift.** When a column promotes from `raw_attrs` to typed (D16), MVs that reference `raw_attrs` continue to work but new MVs should use the typed col. Annotate the migration with the `schema_version` it was written against.
3. **Time-travel / clock skew.** Events accept `ts` in `[now-7d, now+5m]` (contract 01 invariant 8). MVs must tolerate late-arriving rows — AggregatingMergeTree `-Merge` handles this naturally.
4. **Empty cohorts / 1-engineer orgs.** `uniqState` → 0 is valid; the API layer applies k≥5 floor for team tiles and k≥3 for clusters.

---

## Definition of Done

- [ ] All 5 MVs applied via `bun run db:migrate:ch`
- [ ] Seed script generates deterministic 10k-event fixture
- [ ] Per-MV unit tests green (≥30 tests per Workstream D Sprint 1 minimum)
- [ ] Property test (MV sum == raw sum) green
- [ ] EXPLAIN test proving read path hits MV, not raw `events`
- [ ] `bun run test` / `typecheck` / `lint` green
- [ ] Contract 09 changelog appended
- [ ] DEVLOG entry
- [ ] Tickets README flipped to ✅
- [ ] Branch pushed, PR opened `Refs #3`

---

## Estimated Time

| Task | Estimate |
|------|----------|
| Brainstorm + decision lock | 45 min |
| Seed script + fixture | 90 min |
| Write 5 MV tests (TDD) | 2 h |
| Write 5 migrations | 90 min |
| Debug + EXPLAIN verify | 90 min |
| Contract + DEVLOG | 15 min |

~7–8 h. Likely a full day or spread across two mornings.

---

## After This Ticket: What Comes Next

- **D1-03** (projections) — depends on MV column shapes being stable.
- **D1-04** (partition-drop worker) — independent; can start in parallel.
- Unblocks Workstream H (scoring) — they now have pre-aggregated inputs.
- Unblocks Workstream E (dashboard) — they now have read paths that hit MVs not raw.
