// PRD §13 G1 test — repo rename preserves hash via repo_id_hash_aliases.
//
// Scenario:
//   1. G1-webhook-ingest processed a `repository.renamed` → wrote
//      a row into `repo_id_hash_aliases` with (old_hash, new_hash).
//   2. This linker reading the NEW hash must surface the HISTORICAL
//      link rows that were computed against the OLD hash.
//
// D33 stability: provider_repo_id is immutable across rename; the HMAC
// stays constant so in-place old_hash == new_hash for same-tenant renames.
// For the alias test we seed a row with a DIFFERENT old_hash to prove the
// JOIN path is wired.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";
import { defaultTenantSalt, repoIdHash } from "./hash";
import { computeLinkerState, type LinkerInputs } from "./state";
import { writeLinkerState } from "./writer";

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

const SHA = (n: number): string => n.toString(16).padStart(40, "0");
const HASH = (tag: string): Buffer => {
  const b = Buffer.alloc(32);
  Buffer.from(tag).copy(b);
  return b;
};

let tenantId: string;
let sessionId: string;

beforeAll(async () => {
  skip = !(await canConnect(sql));
});
afterAll(async () => {
  await sql.end();
});
beforeEach(async () => {
  if (skip) return;
  const rows = (await sql<Array<{ id: string }>>`
    INSERT INTO orgs (name, slug)
    VALUES ('rename-hash', ${`rename-hash-${Date.now()}-${Math.random()}`})
    RETURNING id`) as unknown as Array<{ id: string }>;
  tenantId = rows[0]!.id;
  sessionId = randomUUID();
});

async function cleanup(): Promise<void> {
  await sql.unsafe(`DELETE FROM session_repo_links WHERE tenant_id = $1`, [tenantId]);
  await sql.unsafe(`DELETE FROM session_repo_eligibility WHERE tenant_id = $1`, [tenantId]);
  await sql.unsafe(`DELETE FROM repo_id_hash_aliases WHERE tenant_id = $1`, [tenantId]);
  await sql.unsafe(`DELETE FROM orgs WHERE id = $1`, [tenantId]);
}

function buildInputs(): LinkerInputs {
  return {
    tenant_id: tenantId,
    tenant_mode: "all",
    installations: [{ installation_id: "i1", status: "active" }],
    repos: [{ provider_repo_id: "rename-101", tracking_state: "inherit" }],
    session: {
      session_id: sessionId,
      direct_provider_repo_ids: ["rename-101"],
      commit_shas: [SHA(1)],
      pr_numbers: [],
    },
    pull_requests: [
      {
        provider_repo_id: "rename-101",
        pr_number: 1,
        head_sha: SHA(1),
        merge_commit_sha: null,
        state: "open",
        from_fork: false,
        title_hash: HASH("t"),
        author_login_hash: HASH("a"),
        additions: 0,
        deletions: 0,
        changed_files: 0,
      },
    ],
    deployments: [],
    aliases: [],
    tombstones: [],
  };
}

const suite = skip ? describe.skip : describe;

suite("repo rename preserves link rows via repo_id_hash_aliases (D33)", () => {
  test("historical rows under old_hash are discoverable through the alias table", async () => {
    // Seed link rows computed under the current (new) repo_id_hash.
    const state = computeLinkerState(buildInputs());
    await writeLinkerState(sql, state, tenantId);
    const authoritativeHash = repoIdHash(defaultTenantSalt(tenantId), "rename-101");

    // Simulate a past rename where the *old* hash was different.
    const oldHash = Buffer.alloc(32, 0xaa);
    await sql.unsafe(
      `INSERT INTO repo_id_hash_aliases (tenant_id, old_hash, new_hash, reason, migrated_at, retires_at)
       VALUES ($1, $2, $3, 'rename', now(), now() + interval '180 days')`,
      [tenantId, oldHash, authoritativeHash],
    );

    // The historical-rows query: find links for any hash that aliases
    // RESOLVE to `authoritativeHash`. This is the canonical read path
    // G2 scoring runs when it needs "rows for repo X across renames":
    //   SELECT l.* FROM session_repo_links l
    //   WHERE l.tenant_id = $1
    //     AND l.repo_id_hash IN (
    //       SELECT new_hash FROM repo_id_hash_aliases
    //       WHERE tenant_id=$1 AND (old_hash=$2 OR new_hash=$2)
    //     );
    const rows = (await sql.unsafe(
      `SELECT l.repo_id_hash, l.match_reason
         FROM session_repo_links l
        WHERE l.tenant_id = $1
          AND (l.repo_id_hash = $2
               OR l.repo_id_hash IN (
                 SELECT new_hash FROM repo_id_hash_aliases
                  WHERE tenant_id = $1 AND old_hash = $2
               ))`,
      [tenantId, oldHash],
    )) as unknown as Array<{ repo_id_hash: Buffer; match_reason: string }>;

    // Without the alias join, oldHash returns nothing. With it, the rows
    // under authoritativeHash are included.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.repo_id_hash.equals(authoritativeHash)).toBe(true);
    await cleanup();
  });
});
