# D1-04 Primer: GDPR partition-drop worker (7-d SLA)

**For:** Fresh session implementing the GDPR erasure worker
**Project:** bema (DevMetrics)
**Workstream:** D (owns worker); I (audit/compliance) is the primary consumer
**Date:** 2026-04-17 (planned)
**Previous work:** `D1-00`, `D1-01`. Does NOT depend on `D1-02`/`D1-03` — can run in parallel. See `docs/DEVLOG.md`.

---

## What Is This Ticket?

A PgBoss-scheduled worker that watches Postgres `erasure_requests`, and for each non-completed request atomically runs `ALTER TABLE events DROP PARTITION WHERE cityHash64(org_id) % 16 = X AND toYYYYMM(ts) = Y` for every partition belonging to the target `(org, engineer, window)`. Writes an immutable `audit_log` row on success and flips `erasure_requests.status='completed'`. GDPR Art. 17(3)(e) carve-out keeps aggregates indefinitely via `HMAC(engineer_id, tenant_salt)` pseudonymization.

### Why It Matters

- **Hard regulatory deadline:** 7-day GDPR erasure SLA (CLAUDE.md Compliance Rules). Missing this = ICO / CNIL / EU DPA findings.
- **Challenger C1 BLOCKER:** TTL was previously considered for Tier-A retention — it leaks raw content during the 24h merge window. Partition drop is atomic; TTL is not.
- **E2E test gate INT12** verifies the 7-d SLA end-to-end. Merge-blocker if broken.
- **CLAUDE.md Architecture Rule #4:** PgBoss is for crons only. This is the canonical cron — schedule-driven, not per-event.

---

## What Was Already Done

- `apps/worker/src/index.ts` is a one-line placeholder awaiting real handlers.
- `events` table uses `PARTITION BY (toYYYYMM(ts), cityHash64(org_id) % 16)` — drop granularity is (month × tenant-shard).
- No `erasure_requests` table yet — create in this ticket OR defer to `D1-05` and gate this work on that.

---

## What This Ticket Must Accomplish

### Goal

`erasure_requests.status='pending'` rows become `status='completed'` within 7 days via an atomic partition drop, with an immutable `audit_log` trail and a test that proves 7-d SLA.

### Deliverables Checklist

#### A. Implementation

- [ ] Install `pg-boss@^9` in `apps/worker/package.json` (first real dependency; flag in PR).
- [ ] `apps/worker/src/boss.ts` — PgBoss instance factory; reads `DATABASE_URL`.
- [ ] `apps/worker/src/jobs/partition_drop.ts` — handler:
  1. Load pending `erasure_requests` rows (oldest first, limit 20 per run).
  2. For each row, compute the list of `(toYYYYMM, cityHash64(org_id) % 16)` partitions overlapping the request's window.
  3. Issue `ALTER TABLE events DROP PARTITION ID '(Y,X)'` for each via `@clickhouse/client`.
  4. Also drop matching partitions on MV tables that partition by day (contract 09 says MVs keep aggregates indefinitely — **no drop on MVs**; aggregates stay under HMAC pseudonymization).
  5. On success: UPDATE `erasure_requests` SET `status='completed', partition_dropped=true, completed_at=now()`; INSERT `audit_log` row.
  6. On failure: log, retry up to 3 times (PgBoss native retry), then alert.
- [ ] `apps/worker/src/cron.ts` — registers the job to run every 1 hour; publishes `erasure_request_seeded` on new rows for near-instant processing (still bounded by 7d max).
- [ ] `apps/worker/src/index.ts` — wire `boss.start()` + register the handler.
- [ ] Schema for `erasure_requests` — IF this ticket creates it (vs deferring to `D1-05`):
  ```ts
  // packages/schema/postgres/schema.ts
  export const erasureRequests = pgTable("erasure_requests", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    requester_user_id: uuid("requester_user_id").notNull().references(() => users.id),
    target_engineer_id: text("target_engineer_id").notNull(),
    target_org_id: uuid("target_org_id").notNull().references(() => orgs.id),
    status: text("status").notNull().default("pending"), // pending | in_progress | completed | failed
    completed_at: timestamp("completed_at", { withTimezone: true }),
    partition_dropped: boolean("partition_dropped").notNull().default(false),
  });
  ```

#### B. Tests

- [ ] `apps/worker/src/jobs/__tests__/partition_drop.test.ts`:
  - Seed an `erasure_requests` row; run the job; assert status='completed' + audit_log row present.
  - Assert target partition rows are gone from `events`.
  - Assert unaffected orgs' rows survive.
- [ ] SLA test: insert a request with `ts = now() - 6d`, run job, assert completion (simulates tight SLA).
- [ ] Idempotency test: run the job twice on the same row — second run is a no-op.
- [ ] INT12 E2E (skeleton; full E2E lives in Workstream I's test harness): call `devmetrics erase --user <id> --org <id>` CLI → worker runs → data gone within N seconds. Can stub the CLI in this ticket and leave true E2E for a later cross-workstream ticket.

#### C. Integration Expectations

- [ ] Audit_log rows use the schema from contract 09 §audit_log: `(id, ts, actor_user_id, action, target_type, target_id, reason, metadata_json)` with `action='partition_drop'`, `target_type='engineer'`, `target_id=target_engineer_id`.
- [ ] Aggregates (MVs from `D1-02`) are NOT dropped — they use HMAC pseudonymization per contract 09 invariant 9.
- [ ] NEVER TTL for Tier A (CLAUDE.md Architecture Rule; challenger C1). This worker is the Tier-A retention mechanism.
- [ ] Worker is horizontally scalable — PgBoss handles lock + retry.

#### D. Documentation

- [ ] DEVLOG entry
- [ ] Tickets README ✅
- [ ] Contract 09 changelog: "partition-drop worker landed — implements GDPR 7-d SLA"
- [ ] Note in PR description: this adds the FIRST runtime dependency (`pg-boss`); per CLAUDE.md §Tech Stack, PgBoss is locked so no PRD amendment needed

---

## Branch & Merge Workflow

```bash
git switch main && git pull
git switch -c D1-04-partition-drop-worker-jorge

# TDD: write job tests first, then handler

bun run lint && bun run typecheck && bun run test

git push -u origin D1-04-partition-drop-worker-jorge
gh pr create --base main \
  --title "feat(worker): GDPR partition-drop worker + erasure_requests table (D1-04)" \
  --body "Refs #3"
```

---

## Important Context

### Files to Create

| File | Why |
|------|-----|
| `apps/worker/src/boss.ts` | PgBoss instance |
| `apps/worker/src/jobs/partition_drop.ts` | Handler |
| `apps/worker/src/cron.ts` | Schedule registration |
| `apps/worker/src/jobs/__tests__/partition_drop.test.ts` | TDD tests |
| `packages/schema/postgres/migrations/0001_erasure_requests.sql` | Drizzle-generated |

### Files to Modify

| File | Action |
|------|--------|
| `apps/worker/package.json` | Add `pg-boss@^9`, `@clickhouse/client` |
| `apps/worker/src/index.ts` | Wire boss + job |
| `packages/schema/postgres/schema.ts` | Add `erasureRequests` + relations |
| `contracts/09-storage-schema.md` | Changelog |
| `docs/DEVLOG.md` | Append |
| `docs/tickets/README.md` | ✅ |

### Files You Should NOT Modify

- `events` schema — dropping partitions doesn't require schema change
- `packages/scoring/` — scoring reads HMAC'd aggregates; unaffected
- Other workers (none yet; but don't touch ingest)

### Files You Should READ for Context

| File | Why |
|------|-----|
| `CLAUDE.md` "GDPR" + "Architecture Rule #4" | Authoritative rules |
| `dev-docs/PRD.md` D7, D8, D15 | Decision references |
| `contracts/09-storage-schema.md` §Retention + §Invariants 3, 7 | Partition drop semantics |

---

## Architectural Decisions

| Decision | Reference | Summary |
|----------|-----------|---------|
| Partition vs TTL | D7, C1 | Partition drop ONLY for Tier A; challenger C1 BLOCKER. |
| Aggregate retention | Inv. 9 | HMAC(engineer_id, tenant_salt), per-tenant salt rotated never. |
| Scheduler | Arch. Rule #4 | PgBoss for crons. Redis Streams / CH MVs for per-event. |
| Granularity | §09 | `(toYYYYMM(ts), cityHash64(org_id) % 16)` — 16 shards per month |

---

## Suggested Implementation Pattern

```ts
// apps/worker/src/jobs/partition_drop.ts
import type PgBoss from "pg-boss";
import { ch } from "../clickhouse";
import { db, erasureRequests, auditLog } from "@bematist/schema/postgres";
import { eq } from "drizzle-orm";

export async function handlePartitionDrop(job: PgBoss.Job) {
  const requests = await db.select()
    .from(erasureRequests)
    .where(eq(erasureRequests.status, "pending"))
    .orderBy(erasureRequests.ts)
    .limit(20);

  for (const req of requests) {
    await db.update(erasureRequests)
      .set({ status: "in_progress" })
      .where(eq(erasureRequests.id, req.id));

    try {
      // Build partition list covering the org's entire event history
      const partitions = await listPartitionsForOrg(req.target_org_id);
      for (const p of partitions) {
        await ch.query({
          query: `ALTER TABLE events DROP PARTITION ID '${p}'`,
        });
      }
      await db.insert(auditLog).values({
        actor_user_id: req.requester_user_id,
        action: "partition_drop",
        target_type: "engineer",
        target_id: req.target_engineer_id,
        reason: `GDPR erasure — request ${req.id}`,
        metadata_json: { partitions },
      });
      await db.update(erasureRequests)
        .set({ status: "completed", completed_at: new Date(), partition_dropped: true })
        .where(eq(erasureRequests.id, req.id));
    } catch (err) {
      await db.update(erasureRequests)
        .set({ status: "failed" })
        .where(eq(erasureRequests.id, req.id));
      throw err;  // let PgBoss retry
    }
  }
}
```

---

## Edge Cases to Handle

1. **Partition doesn't exist** (already dropped, or request arrived for never-written data). `DROP PARTITION` on a non-existent partition errors; wrap in `try/catch` and treat as success.
2. **Request spans multiple engineers in same partition.** Partition granularity is `(month, tenant-shard)`, NOT per-engineer. Dropping removes ALL engineers in that shard for that month. Document this: erasure is best-effort partition-level; per-engineer surgical delete would require a `DELETE WHERE` which is non-atomic in CH. Confirm acceptable with Workstream I legal review.
3. **Concurrent requests for same org.** PgBoss lock prevents duplicate processing; second request becomes a no-op because partitions are already gone.
4. **Clock skew on `completed_at`.** Write server's `now()`, not wall-clock.
5. **MV data.** Aggregates NEVER dropped — only HMAC'd. Test that MV rows remain after a partition drop against the same org.

---

## Definition of Done

- [ ] `pg-boss` installed + wired
- [ ] `erasure_requests` table created + migration applied
- [ ] Worker handler + cron schedule in place
- [ ] Tests: completion, SLA, idempotency, unaffected-orgs survival, MV rows survive
- [ ] `bun run test` / `typecheck` / `lint` green
- [ ] Contract 09 changelog
- [ ] DEVLOG entry
- [ ] Tickets README ✅
- [ ] Branch pushed, PR `Refs #3`

---

## Estimated Time

| Task | Estimate |
|------|----------|
| pg-boss + boss.ts scaffold | 45 min |
| erasure_requests schema + migration | 30 min |
| Handler (TDD tests first) | 3 h |
| Cron schedule + index.ts wire | 30 min |
| Docs + DEVLOG | 15 min |

~5 h.

---

## After This Ticket: What Comes Next

- **D1-05** (remaining PG tables) — `erasure_requests` lands here or there, depending on which ships first.
- **D1-06** (RLS) — enforces tenant isolation on the control-plane tables, including `erasure_requests`.
- Workstream I (compliance) can now wire `devmetrics erase` CLI to this worker.
