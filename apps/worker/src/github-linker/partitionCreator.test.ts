// Integration test — real Postgres.
// Skips gracefully when DATABASE_URL unreachable.
//
// Coverage:
//   - creates next-month partition when missing
//   - idempotent: second call returns monthsCreated=[]
//   - attaches all 5 indexes declared in PRD §9.6

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import postgres, { type Sql } from "postgres";
import { ensurePartitionsFor } from "./partitionCreator";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/bematist";

const sql = postgres(DATABASE_URL, { prepare: false, max: 2, onnotice: () => {} });
let skip = false;

async function canConnect(sql: Sql): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  skip = !(await canConnect(sql));
});
afterAll(async () => {
  await sql.end();
});

const suite = skip ? describe.skip : describe;

suite("ensurePartitionsFor — PgBoss partition creator (PRD §9.6)", () => {
  test("creates missing partition and attaches 5 indexes; idempotent on rerun", async () => {
    // Pick a far-future month unlikely to exist already.
    const target = new Date(Date.UTC(2099, 0, 15)); // 2099-01-15 UTC

    // First run — both 2099-01, 2099-02 may not exist; 2099-03 also
    // ensured defensively. All three should create.
    const first = await ensurePartitionsFor(sql, target);
    expect(first.monthsEnsured.length).toBeGreaterThanOrEqual(2);
    expect(first.monthsCreated.length).toBeGreaterThanOrEqual(1);

    // Every created partition has the five indexes
    for (const name of first.monthsCreated) {
      const rows = (await sql.unsafe(`SELECT indexname FROM pg_indexes WHERE tablename = $1`, [
        name,
      ])) as unknown as Array<{ indexname: string }>;
      const names = rows.map((r) => r.indexname);
      expect(names.some((n) => n.endsWith("_unique_idx"))).toBe(true);
      expect(names.some((n) => n.endsWith("_repo_computed_idx"))).toBe(true);
      expect(names.some((n) => n.endsWith("_session_idx"))).toBe(true);
      expect(names.some((n) => n.endsWith("_inputs_idx"))).toBe(true);
      expect(names.some((n) => n.endsWith("_stale_idx"))).toBe(true);
    }

    // Second run — no new creates
    const second = await ensurePartitionsFor(sql, target);
    expect(second.monthsCreated).toEqual([]);
    expect(second.monthsSkipped.length).toBe(first.monthsEnsured.length);

    // Cleanup — DROP partitions we just made (tests don't pollute the DB
    // for later runs)
    for (const name of first.monthsCreated) {
      await sql.unsafe(`DROP TABLE IF EXISTS ${name}`);
    }
  });
});
