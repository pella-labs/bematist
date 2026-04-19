// Backfill worker — integration test against real Postgres.
//
// PRD §9.9: "Worker streams through repos / git_events in 10k chunks writing
// new columns from existing data (repo_id_hash := hmac(tenant_salt,
// 'github:' || provider_repo_id))."
//
// Assertions:
//   1. With 10,500 git_events rows seeded (forces 2 chunks at chunkSize=10k,
//      OR forces >1 chunk at a smaller test chunk size), every row that has
//      a resolvable joined `repos.provider_repo_id` ends up with a
//      non-null `repo_id_hash`.
//   2. Rows WITHOUT a matching provider_repo_id stay NULL (explicit
//      "skip — linker will handle it" semantics).
//   3. The hash is exactly `hmac(tenantSalt(orgId), 'github:' || providerRepoId)`
//      per D33.
//   4. Re-running the worker writes ZERO additional rows (idempotency).
//   5. Chunk count > 1 (proves chunking works — not one giant UPDATE).
//
// Gated on DATABASE_URL so `bun run test` without docker doesn't fail.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import postgres from "postgres";
import { computeRepoIdHash, runBackfill } from "./backfill";

const PG_LIVE = process.env.DATABASE_URL !== undefined;
const SUPER_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/bematist";

interface Setup {
  client: ReturnType<typeof postgres>;
  org: string;
  repoWith: { id: string; provider_repo_id: string; repo_id_hash: string };
  repoWithout: { id: string; repo_id_hash: string };
  eventsWith: number; // count of git_events rows with a joinable repo
  eventsWithout: number;
  testSalt: (orgId: string) => Buffer;
}

let setup: Setup | null = null;

// biome-ignore lint/suspicious/noExplicitAny: bun:test exposes skipIf at runtime
const runIfPg = (test as any).skipIf ? (test as any).skipIf(!PG_LIVE) : test;

beforeAll(async () => {
  if (!PG_LIVE) return;
  const client = postgres(SUPER_URL, { max: 2, idle_timeout: 5, connect_timeout: 5 });

  // Fresh org under a dedicated slug so the test doesn't stomp on other
  // tests' seed data. Cleanup happens in afterAll via cascade from orgs.
  const orgRows = (await client.unsafe(
    `INSERT INTO orgs (slug, name) VALUES ('backfill_g1', 'Backfill G1')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
  )) as unknown as Array<{ id: string }>;
  const org = orgRows[0]?.id;
  if (!org) throw new Error("backfill seed org missing");

  // Clean any prior run.
  await client.unsafe(`DELETE FROM git_events WHERE org_id = $1`, [org]);
  await client.unsafe(`DELETE FROM repos WHERE org_id = $1`, [org]);

  // The `repos_github_provider_id_required` constraint is NOT VALID: PG
  // doesn't scan existing rows, but it DOES enforce against new inserts.
  // In production, the "legacy" rows we want to backfill were inserted
  // BEFORE this migration landed. To faithfully simulate that in-test,
  // we briefly drop the constraint, seed the legacy-shaped rows, then
  // re-add the constraint NOT VALID (matching the migration's shape).
  // This proves the backfill worker correctly handles the mixed
  // population the NOT VALID clause is designed for.
  await client.unsafe(
    `ALTER TABLE repos DROP CONSTRAINT IF EXISTS repos_github_provider_id_required`,
  );

  // Two repos: one with provider_repo_id (joinable), one without.
  const repoWithRows = (await client.unsafe(
    `INSERT INTO repos (org_id, repo_id_hash, provider, provider_repo_id)
     VALUES ($1, 'backfill_repo_with_hash', 'github', 'REPO_WITH_ID')
     RETURNING id`,
    [org],
  )) as unknown as Array<{ id: string }>;
  const repoWithoutRows = (await client.unsafe(
    `INSERT INTO repos (org_id, repo_id_hash, provider, provider_repo_id)
     VALUES ($1, 'backfill_repo_without_hash', 'github', NULL)
     RETURNING id`,
    [org],
  )) as unknown as Array<{ id: string }>;

  // Re-add NOT VALID so future writes to this DB during the test suite
  // still experience the same constraint shape production will see.
  await client.unsafe(
    `ALTER TABLE repos
       ADD CONSTRAINT repos_github_provider_id_required
       CHECK (provider <> 'github' OR provider_repo_id IS NOT NULL) NOT VALID`,
  );
  const repoWith = {
    id: repoWithRows[0]?.id ?? "",
    provider_repo_id: "REPO_WITH_ID",
    repo_id_hash: "backfill_repo_with_hash",
  };
  const repoWithout = {
    id: repoWithoutRows[0]?.id ?? "",
    repo_id_hash: "backfill_repo_without_hash",
  };

  // Seed 10,500 git_events total: 10,500 with joinable provider_repo_id
  // plus 100 without (so we can prove the "without" rows stay NULL). Forces
  // >1 chunk at a test chunk size (500 in assertions) AND at the default
  // chunk size (10,000). Generate PR numbers to keep pr_node_id unique.
  //
  // NOTE: `pr_node_id` has a UNIQUE index on git_events, so each row needs
  // a distinct value. We don't set pr_node_id for the null-case rows.
  const chunkInsert = 500;
  const withTotal = 10_500;
  const withoutTotal = 100;

  for (let off = 0; off < withTotal; off += chunkInsert) {
    const batch = Math.min(chunkInsert, withTotal - off);
    // Use jsonb_build_object to push a fat batch per round-trip.
    const vals: string[] = [];
    const params: string[] = [];
    for (let i = 0; i < batch; i++) {
      const idx = off + i;
      vals.push(
        `($${params.length + 1}, 'github', 'push', $${params.length + 2}, $${params.length + 3}, '{}'::jsonb)`,
      );
      params.push(org, `pr_node_w_${idx}`, repoWith.repo_id_hash);
    }
    await client.unsafe(
      `INSERT INTO git_events (org_id, source, event_kind, pr_node_id, repo_id, payload)
       VALUES ${vals.join(",")}`,
      params,
    );
  }

  for (let i = 0; i < withoutTotal; i++) {
    await client.unsafe(
      `INSERT INTO git_events (org_id, source, event_kind, pr_node_id, repo_id, payload)
       VALUES ($1, 'github', 'push', $2, $3, '{}'::jsonb)`,
      [org, `pr_node_wo_${i}`, repoWithout.repo_id_hash],
    );
  }

  // Deterministic test salt so assertions can reproduce the exact hash.
  const testSalt = (orgId: string) =>
    Buffer.from(createHmac("sha256", "test-salt").update(orgId).digest());

  setup = {
    client,
    org,
    repoWith,
    repoWithout,
    eventsWith: withTotal,
    eventsWithout: withoutTotal,
    testSalt,
  };
});

afterAll(async () => {
  if (setup) {
    await setup.client.unsafe(`DELETE FROM git_events WHERE org_id = $1`, [setup.org]);
    await setup.client.unsafe(`DELETE FROM repos WHERE org_id = $1`, [setup.org]);
    await setup.client.unsafe(`DELETE FROM orgs WHERE id = $1`, [setup.org]);
    await setup.client.end().catch(() => {});
  }
});

function requireSetup(): Setup {
  if (!setup) throw new Error("setup not complete — DATABASE_URL unset?");
  return setup;
}

describe("G1 backfill worker", () => {
  runIfPg(
    "writes repo_id_hash for every row with a joinable provider_repo_id (2-chunk run)",
    async () => {
      const s = requireSetup();
      // Sanity preflight: the seed landed the expected total row count.
      const seedCount = (await s.client.unsafe(
        `SELECT count(*)::int AS c FROM git_events WHERE org_id = $1 AND source = 'github'`,
        [s.org],
      )) as unknown as Array<{ c: number }>;
      expect(seedCount[0]?.c).toBe(s.eventsWith + s.eventsWithout);

      const events: Array<string> = [];

      // Force >1 chunk by using a small chunkSize; also proves git_events_chunk
      // is emitted more than once.
      const report = await runBackfill({
        sql: s.client,
        tenantSalt: s.testSalt,
        chunkSize: 500,
        log: (ev) => {
          if (ev.stage.startsWith("git_events")) events.push(ev.stage);
        },
      });

      // Scoped assertions: `scanned` AT LEAST our seeded count (other tests
      // may have left stray github rows in the shared table). `updated` for
      // OUR org is exactly `eventsWith` — that's the load-bearing invariant.
      expect(report.git_events.scanned).toBeGreaterThanOrEqual(s.eventsWith + s.eventsWithout);
      expect(report.git_events.chunks).toBeGreaterThan(1);

      // stages emitted in order: start → chunk* → done.
      expect(events[0]).toBe("git_events_start");
      expect(events[events.length - 1]).toBe("git_events_done");
      const chunkEvents = events.filter((e) => e === "git_events_chunk").length;
      expect(chunkEvents).toBeGreaterThan(1);

      // "with" rows all populated; "without" rows all still NULL.
      const withRows = (await s.client.unsafe(
        `SELECT count(*)::int AS c FROM git_events
         WHERE org_id = $1 AND repo_id = $2 AND repo_id_hash IS NOT NULL`,
        [s.org, s.repoWith.repo_id_hash],
      )) as unknown as Array<{ c: number }>;
      expect(withRows[0]?.c).toBe(s.eventsWith);

      const withoutNull = (await s.client.unsafe(
        `SELECT count(*)::int AS c FROM git_events
         WHERE org_id = $1 AND repo_id = $2 AND repo_id_hash IS NULL`,
        [s.org, s.repoWithout.repo_id_hash],
      )) as unknown as Array<{ c: number }>;
      expect(withoutNull[0]?.c).toBe(s.eventsWithout);

      // Hash exactly matches the D33 formula using the TEST salt.
      const expected = computeRepoIdHash(s.testSalt(s.org), s.repoWith.provider_repo_id);
      const sample = (await s.client.unsafe(
        `SELECT repo_id_hash FROM git_events
         WHERE org_id = $1 AND repo_id = $2 AND repo_id_hash IS NOT NULL
         LIMIT 1`,
        [s.org, s.repoWith.repo_id_hash],
      )) as unknown as Array<{ repo_id_hash: Buffer }>;
      expect(sample[0]?.repo_id_hash?.equals(expected)).toBe(true);
    },
  );

  runIfPg("idempotent — re-running writes zero additional rows, zero errors", async () => {
    const s = requireSetup();

    // Snapshot our-org `repo_id_hash IS NULL` rows BEFORE the second run —
    // these are the "without provider_repo_id" rows that can't be hashed
    // and will remain NULL across runs. The second run's scanned count
    // should equal this baseline (plus any other tests' remaining NULL
    // github rows — we don't control those).
    const ourNullBefore = (await s.client.unsafe(
      `SELECT count(*)::int AS c FROM git_events
       WHERE org_id = $1 AND source = 'github' AND repo_id_hash IS NULL`,
      [s.org],
    )) as unknown as Array<{ c: number }>;
    expect(ourNullBefore[0]?.c).toBe(s.eventsWithout);

    // Second pass must write ZERO new hashes for OUR org's rows — the first
    // pass exhausted the joinable ones, and the unjoinable ones have no
    // provider_repo_id source.
    const second = await runBackfill({
      sql: s.client,
      tenantSalt: s.testSalt,
      chunkSize: 500,
      log: () => {},
    });
    expect(second.git_events.updated).toBe(0);

    // "with" rows unchanged.
    const stillPopulated = (await s.client.unsafe(
      `SELECT count(*)::int AS c FROM git_events
       WHERE org_id = $1 AND repo_id = $2 AND repo_id_hash IS NOT NULL`,
      [s.org, s.repoWith.repo_id_hash],
    )) as unknown as Array<{ c: number }>;
    expect(stillPopulated[0]?.c).toBe(s.eventsWith);
  });

  runIfPg("repos stage scans pending github rows without writing provider_repo_id", async () => {
    const s = requireSetup();
    const stages: string[] = [];
    const report = await runBackfill({
      sql: s.client,
      tenantSalt: s.testSalt,
      chunkSize: 500,
      log: (ev) => {
        if (ev.stage.startsWith("repos")) stages.push(ev.stage);
      },
    });
    // One repo in the seed lacks provider_repo_id, so scanned should be ≥ 1
    // and updated stays 0 (G1-linker is the provider_repo_id writer).
    expect(report.repos.scanned).toBeGreaterThanOrEqual(1);
    expect(report.repos.updated).toBe(0);
    expect(stages[0]).toBe("repos_start");
    expect(stages[stages.length - 1]).toBe("repos_done");
  });
});

runIfPg("unit: computeRepoIdHash matches D33 formula exactly", () => {
  // No Postgres needed — pure function. Still runIfPg to keep the suite
  // gated behind a live-DB guard so non-docker devs don't see a misleading
  // "some tests ran" while the real assertions were skipped.
  const salt = Buffer.from("x".repeat(64), "hex");
  const out = computeRepoIdHash(salt, "123456789");
  const expected = Buffer.from(createHmac("sha256", salt).update("github:123456789").digest());
  expect(out.equals(expected)).toBe(true);
});

if (!PG_LIVE) {
  test("backfill worker tests skipped — DATABASE_URL not set", () => {
    expect(true).toBe(true);
  });
}
