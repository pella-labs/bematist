# D1-03 Primer: Projections on `events` + EXPLAIN gates

**For:** Fresh session adding projections once MVs are stable
**Project:** bema (DevMetrics)
**Workstream:** D (Storage & Schema)
**Date:** 2026-04-17 (planned)
**Previous work:** `D1-02` materialized views. See `docs/DEVLOG.md`.

---

## What Is This Ticket?

Two projections on `events` that re-order rows by `(org_id, repo_id_hash, ts)` and `(org_id, cluster_id, ts)` so repo-drill and cluster-drill queries don't full-scan. The primary `ORDER BY (org_id, ts, engineer_id)` matches 3 of 4 headline queries — projections cover the 4th and 5th.

### Why It Matters

- Without them, a "show me all events for repo X last week" query scans the entire month's partition — orders of magnitude slower than the projected read.
- Contract 09 §Projections names them explicitly; GH issue #3 calls them out as a Sprint 1 deliverable with EXPLAIN verification.
- They're additive ALTERs — don't change the primary ORDER BY, don't break existing queries.

---

## What Was Already Done

- `events` primary `ORDER BY (org_id, ts, engineer_id)` — contract 09 §events.
- MVs landed in `D1-02` — stable column shapes to reference in projection SELECTs.

---

## What This Ticket Must Accomplish

### Goal

Two projections applied via migration; a test harness proves `EXPLAIN PIPELINE` / `EXPLAIN indexes=1` shows each headline query using the intended projection.

### Deliverables Checklist

#### A. Implementation

- [ ] `packages/schema/clickhouse/migrations/0007_projection_repo_lookup.sql`:
  ```sql
  ALTER TABLE events ADD PROJECTION repo_lookup (
    SELECT *
    ORDER BY (org_id, repo_id_hash, ts)
  );
  ALTER TABLE events MATERIALIZE PROJECTION repo_lookup;
  ```
- [ ] `packages/schema/clickhouse/migrations/0008_projection_cluster_lookup.sql`:
  ```sql
  ALTER TABLE events ADD PROJECTION cluster_lookup (
    SELECT *
    ORDER BY (org_id, cluster_id, ts)
  );
  ALTER TABLE events MATERIALIZE PROJECTION cluster_lookup;
  ```
- [ ] EXPLAIN helper in `packages/schema/clickhouse/explain.ts` — wraps `clickhouse-client.query('EXPLAIN PIPELINE …')` and parses output for "Projection: <name>" line.

#### B. Tests

- [ ] `packages/schema/clickhouse/__tests__/projection_repo.test.ts` — seed a repo-filtered slice; assert EXPLAIN shows `Projection: repo_lookup`.
- [ ] `packages/schema/clickhouse/__tests__/projection_cluster.test.ts` — analogous for `cluster_lookup`.
- [ ] Negative test: a time-range-only query does NOT use projections (confirms they're not grabbed unnecessarily).
- [ ] Post-migration test: row counts match pre-migration (projections don't delete data).

#### C. Integration Expectations

- [ ] `MATERIALIZE PROJECTION` is slow on a large table — add a migration comment warning that production deploys should schedule maintenance windows.
- [ ] Read paths that benefit (Workstream E — repo page, cluster page; Workstream H — Twin Finder) need no code changes; ClickHouse uses projections transparently when `ORDER BY` matches.
- [ ] Contract 09 §Projections already documents these — no contract change needed unless we add a 3rd projection.

#### D. Documentation

- [ ] Append `docs/DEVLOG.md` entry
- [ ] Update tickets README → ✅
- [ ] Contract 09 changelog: note "repo_lookup and cluster_lookup projections materialized via migrations 0007/0008."

---

## Branch & Merge Workflow

```bash
git switch main && git pull
git switch -c D1-03-projections-jorge

# Write EXPLAIN helper first, then projection tests, then migrations

bun run lint && bun run typecheck && bun run test
bun run db:migrate:ch

git push -u origin D1-03-projections-jorge
gh pr create --base main \
  --title "feat(schema): repo + cluster projections on events (Sprint 1 D1-03)" \
  --body "Refs #3"
```

---

## Important Context

### Files to Create

| File | Why |
|------|-----|
| `packages/schema/clickhouse/migrations/0007_projection_repo_lookup.sql` | Repo-drill query path |
| `packages/schema/clickhouse/migrations/0008_projection_cluster_lookup.sql` | Cluster-drill query path |
| `packages/schema/clickhouse/explain.ts` | EXPLAIN parser — reused in subsequent tickets |
| `packages/schema/clickhouse/__tests__/projection_*.test.ts` | Gate tests |

### Files to Modify

| File | Action |
|------|--------|
| `contracts/09-storage-schema.md` | Changelog line |
| `docs/DEVLOG.md` | Append |
| `docs/tickets/README.md` | ✅ |

### Files You Should NOT Modify

- `0001_events.sql` — primary ORDER BY stays unchanged (contract 09 invariant 1)
- MVs from `D1-02` — projections are orthogonal

### Files You Should READ for Context

| File | Why |
|------|-----|
| `contracts/09-storage-schema.md` §Projections | Authoritative definition |
| `CLAUDE.md` "Database Rules" §ClickHouse | EXPLAIN mandatory for new queries |
| `dev-docs/PRD.md` §10 INT11 | p95 dashboard <2s perf gate |

---

## Architectural Decisions

| Decision | Reference | Summary |
|----------|-----------|---------|
| Projection over secondary ORDER BY | §09 | Don't change primary `ORDER BY`; additive projections only. |
| Why two, not three | §09 | Time-range + engineer drill already fast via primary key. Repo + cluster are the gaps. |
| Materialize on-apply | — | `MATERIALIZE PROJECTION` up front for dev/CI; production deploys may defer. |

---

## Suggested Implementation Pattern

**EXPLAIN helper:**

```ts
// packages/schema/clickhouse/explain.ts
export async function assertUsesProjection(
  query: string,
  expected: "repo_lookup" | "cluster_lookup" | "none",
): Promise<void> {
  const result = await ch.query({ query: `EXPLAIN PIPELINE ${query}`, format: "TSV" });
  const text = await result.text();
  const match = text.match(/Projection:\s*(\w+)/);
  const got = match?.[1] ?? "none";
  if (got !== expected) {
    throw new Error(`EXPLAIN mismatch: expected ${expected}, got ${got}\n${text}`);
  }
}
```

---

## Edge Cases to Handle

1. **Projection not picked.** If the query's `WHERE` doesn't prefix-match the projection's `ORDER BY`, ClickHouse falls back to primary. Test both the hit and the fallback.
2. **Projection during INSERT.** Writes now update both the main table and the projection — measure `@clickhouse/client` HTTP p99 insert latency on the D1-02 seed fixture before + after. Document the delta in PR description.
3. **Partition drop vs projection.** `DROP PARTITION` (D1-04's GDPR worker) also drops projection parts — no special handling needed, but verify in a test.

---

## Definition of Done

- [ ] Both projections applied and materialized
- [ ] EXPLAIN tests prove projection hit for repo + cluster queries
- [ ] Negative test confirms time-range queries don't use them
- [ ] Insert perf delta measured + documented in PR
- [ ] `bun run test` / `typecheck` / `lint` green
- [ ] Contract 09 changelog appended
- [ ] DEVLOG entry
- [ ] Tickets README ✅
- [ ] Branch pushed, PR `Refs #3`

---

## Estimated Time

| Task | Estimate |
|------|----------|
| EXPLAIN helper | 45 min |
| Projection tests (TDD) | 90 min |
| Migrations | 30 min |
| Insert-perf delta measurement | 60 min |
| Docs + DEVLOG | 15 min |

~4 h.

---

## After This Ticket: What Comes Next

- **D1-04** (partition-drop worker) — parallel-safe, no dep on this.
- **D1-06** (RLS + INT9) — unaffected.
- Workstream E dashboard repo-page + cluster-page tile queries now hit projections automatically.
