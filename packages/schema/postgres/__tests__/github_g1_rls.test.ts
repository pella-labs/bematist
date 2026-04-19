// INT9 extension for the 8 G1 GitHub-integration tables — MERGE BLOCKER
// per CLAUDE.md Architecture Rule #9 + PRD §9.10.
//
// Mirrors rls_int9.test.ts but scoped to the G1 tables. For each new table:
//   - Seed row for org A + org B via superuser (RLS bypassed).
//   - Connect as app_bematist (NOBYPASSRLS); WITHOUT app.current_org_id set,
//     every SELECT returns 0 rows (defensive default-deny).
//   - WITH app.current_org_id = orgA, SELECT returns only orgA rows.
//   - WITH app.current_org_id = orgA, INSERT with tenant_id = orgB is
//     rejected by the WITH CHECK policy.
//   - WITH app.current_org_id = orgA, UPDATE targeting orgB's row touches
//     0 rows (USING clause filters it out).
//   - WITH app.current_org_id = orgA, DELETE targeting orgB's row touches
//     0 rows.
//
// Every failure means a cross-tenant leak and BLOCKS MERGE.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import postgres from "postgres";

const PG_LIVE = process.env.DATABASE_URL !== undefined;
const SUPER_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/bematist";
const APP_URL = SUPER_URL.replace(
  "postgres://postgres:postgres@",
  "postgres://app_bematist:app_bematist_dev@",
);

interface Setup {
  superClient: ReturnType<typeof postgres>;
  appClient: ReturnType<typeof postgres>;
  orgA: string;
  orgB: string;
  sessionA: string;
  sessionB: string;
  // bytea seeds unique per org so row count assertions are deterministic.
  hashA: Buffer;
  hashB: Buffer;
}

let setup: Setup | null = null;

beforeAll(async () => {
  if (!PG_LIVE) return;
  const superClient = postgres(SUPER_URL, { max: 2, idle_timeout: 5, connect_timeout: 5 });
  const appClient = postgres(APP_URL, { max: 2, idle_timeout: 5, connect_timeout: 5 });

  // Seed two orgs (idempotent; unique by slug). Pick G1-scoped slugs so this
  // test doesn't stomp on rls_int9.test.ts's m4a/m4b seeds.
  await superClient.unsafe(
    `INSERT INTO orgs (slug, name)
     VALUES ('g1rls_a', 'G1 RLS A'), ('g1rls_b', 'G1 RLS B')
     ON CONFLICT (slug) DO NOTHING`,
  );
  const rows = (await superClient.unsafe(
    `SELECT id, slug FROM orgs WHERE slug IN ('g1rls_a', 'g1rls_b')`,
  )) as unknown as Array<{ id: string; slug: string }>;
  const a = rows.find((r) => r.slug === "g1rls_a")?.id;
  const b = rows.find((r) => r.slug === "g1rls_b")?.id;
  if (!a || !b) throw new Error("g1rls seed orgs missing");

  // Deterministic per-org uuids/buffers so assertions can match exact rows.
  // We avoid randomness so flakiness can't mask a leak.
  const sessionA = "11111111-1111-4111-8111-111111111111";
  const sessionB = "22222222-2222-4222-8222-222222222222";
  const hashA = Buffer.from("a".repeat(64), "hex");
  const hashB = Buffer.from("b".repeat(64), "hex");

  // Seed G1 tables for BOTH orgs. IMPORTANT: CHECK-constraint-valid values
  // everywhere — otherwise the seed itself would fail with a non-RLS reason.
  async function seed(org: string, session: string, hash: Buffer, tag: "a" | "b") {
    // github_installations — installation_id must be globally unique.
    await superClient.unsafe(
      `INSERT INTO github_installations
         (tenant_id, installation_id, github_org_id, github_org_login, app_id,
          status, token_ref, webhook_secret_active_ref)
       VALUES ($1, $2, $3, $4, 1, 'active', 'ref_token', 'ref_secret')
       ON CONFLICT (installation_id) DO NOTHING`,
      [org, tag === "a" ? 1001 : 1002, tag === "a" ? 2001 : 2002, `login_${tag}`],
    );
    // github_pull_requests. Column order matches the INSERT list:
    //   $1 tenant_id, $2 provider_repo_id, $3 pr_node_id (state literal),
    //   $4 title_hash (bytea), $5 head_sha (char 40), $6 author_login_hash (bytea).
    await superClient.unsafe(
      `INSERT INTO github_pull_requests
         (tenant_id, provider_repo_id, pr_number, pr_node_id, state,
          title_hash, base_ref, head_ref, head_sha, author_login_hash, opened_at)
       VALUES ($1, $2, 1, $3, 'open', $4, 'main', 'feature', $5, $6, now())
       ON CONFLICT DO NOTHING`,
      [
        org,
        `repo_${tag}`,
        `pr_node_${tag}`,
        hash,
        "a".repeat(40), // head_sha char(40)
        hash,
      ],
    );
    // github_check_suites.
    await superClient.unsafe(
      `INSERT INTO github_check_suites
         (tenant_id, provider_repo_id, head_sha, suite_id, status)
       VALUES ($1, $2, $3, $4, 'queued')
       ON CONFLICT DO NOTHING`,
      [org, `repo_${tag}`, "a".repeat(40), tag === "a" ? 9001 : 9002],
    );
    // github_deployments.
    await superClient.unsafe(
      `INSERT INTO github_deployments
         (tenant_id, provider_repo_id, deployment_id, environment, sha, ref, status)
       VALUES ($1, $2, $3, 'production', $4, 'refs/heads/main', 'pending')
       ON CONFLICT DO NOTHING`,
      [org, `repo_${tag}`, tag === "a" ? 7001 : 7002, "c".repeat(40)],
    );
    // github_code_owners.
    await superClient.unsafe(
      `INSERT INTO github_code_owners
         (tenant_id, provider_repo_id, ref, content_sha256, rules)
       VALUES ($1, $2, 'main', $3, '[]'::jsonb)
       ON CONFLICT DO NOTHING`,
      [org, `repo_${tag}`, hash],
    );
    // session_repo_links (partitioned by computed_at — seed into 2026-04 range).
    await superClient.unsafe(
      `INSERT INTO session_repo_links
         (tenant_id, session_id, repo_id_hash, match_reason, provider_repo_id,
          evidence, confidence, inputs_sha256, computed_at)
       VALUES ($1, $2, $3, 'direct_repo', $4, '{}'::jsonb, 50, $5, '2026-04-15'::timestamptz)
       ON CONFLICT DO NOTHING`,
      [org, session, hash, `repo_${tag}`, hash],
    );
    // session_repo_eligibility.
    await superClient.unsafe(
      `INSERT INTO session_repo_eligibility
         (tenant_id, session_id, effective_at, eligibility_reasons, eligible, inputs_sha256)
       VALUES ($1, $2, now(), '{}'::jsonb, true, $3)
       ON CONFLICT DO NOTHING`,
      [org, session, hash],
    );
    // repo_id_hash_aliases.
    await superClient.unsafe(
      `INSERT INTO repo_id_hash_aliases
         (tenant_id, old_hash, new_hash, reason, retires_at)
       VALUES ($1, $2, $3, 'rename', now() + interval '180 days')
       ON CONFLICT DO NOTHING`,
      [org, hash, Buffer.concat([hash, Buffer.from([0x01])])],
    );
  }

  await seed(a, sessionA, hashA, "a");
  await seed(b, sessionB, hashB, "b");

  setup = {
    superClient,
    appClient,
    orgA: a,
    orgB: b,
    sessionA,
    sessionB,
    hashA,
    hashB,
  };
});

afterAll(async () => {
  if (setup) {
    // Cleanup so subsequent test runs + rls_int9 probes start clean.
    const { superClient, orgA, orgB } = setup;
    for (const t of [
      "repo_id_hash_aliases",
      "session_repo_eligibility",
      "session_repo_links",
      "github_code_owners",
      "github_deployments",
      "github_check_suites",
      "github_pull_requests",
      "github_installations",
    ]) {
      await superClient.unsafe(`DELETE FROM ${t} WHERE tenant_id IN ($1, $2)`, [orgA, orgB]);
    }
    await superClient.end().catch(() => {});
    await setup.appClient.end().catch(() => {});
  }
});

// biome-ignore lint/suspicious/noExplicitAny: bun:test exposes skipIf at runtime
const runIfPg = (test as any).skipIf ? (test as any).skipIf(!PG_LIVE) : test;

function requireSetup(): Setup {
  if (!setup) throw new Error("setup not complete — DATABASE_URL unset?");
  return setup;
}

const NEW_TABLES_WITH_COL = [
  { t: "github_installations", col: "tenant_id" },
  { t: "github_pull_requests", col: "tenant_id" },
  { t: "github_check_suites", col: "tenant_id" },
  { t: "github_deployments", col: "tenant_id" },
  { t: "github_code_owners", col: "tenant_id" },
  { t: "session_repo_links", col: "tenant_id" },
  { t: "session_repo_eligibility", col: "tenant_id" },
  { t: "repo_id_hash_aliases", col: "tenant_id" },
] as const;

describe("INT9 extension (G1) — cross-tenant probes, MERGE BLOCKER", () => {
  runIfPg(
    "without app.current_org_id set, every new table returns 0 rows (default-deny)",
    async () => {
      const s = requireSetup();
      for (const { t } of NEW_TABLES_WITH_COL) {
        const rows = (await s.appClient.unsafe(
          `SELECT count(*)::int AS c FROM ${t}`,
        )) as unknown as Array<{ c: number }>;
        expect({ table: t, count: rows[0]?.c }).toEqual({ table: t, count: 0 });
      }
    },
  );

  runIfPg("with org A set, tables return ONLY org A rows (no leak of org B rows)", async () => {
    const s = requireSetup();
    await s.appClient.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL app.current_org_id = '${s.orgA}'`);
      for (const { t, col } of NEW_TABLES_WITH_COL) {
        const rows = (await tx.unsafe(
          `SELECT count(*)::int AS total,
                    count(*) FILTER (WHERE ${col} = '${s.orgA}')::int AS a_rows,
                    count(*) FILTER (WHERE ${col} = '${s.orgB}')::int AS b_rows
             FROM ${t}`,
        )) as unknown as Array<{ total: number; a_rows: number; b_rows: number }>;
        const r = rows[0];
        if (!r) throw new Error(`no row from ${t}`);
        expect({ table: t, total_gt_0: r.total > 0 }).toEqual({ table: t, total_gt_0: true });
        expect({ table: t, b_leaked: r.b_rows }).toEqual({ table: t, b_leaked: 0 });
        expect({ table: t, a_ok: r.a_rows === r.total }).toEqual({
          table: t,
          a_ok: true,
        });
      }
    });
  });

  runIfPg("with org B set, tables return ONLY org B rows (no leak of org A rows)", async () => {
    const s = requireSetup();
    await s.appClient.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL app.current_org_id = '${s.orgB}'`);
      for (const { t, col } of NEW_TABLES_WITH_COL) {
        const rows = (await tx.unsafe(
          `SELECT count(*) FILTER (WHERE ${col} = '${s.orgA}')::int AS a_leak FROM ${t}`,
        )) as unknown as Array<{ a_leak: number }>;
        expect({ table: t, a_leaked: rows[0]?.a_leak }).toEqual({ table: t, a_leaked: 0 });
      }
    });
  });

  runIfPg(
    "INSERT of a cross-tenant row (tenant_id = org B while session set to org A) is rejected",
    async () => {
      const s = requireSetup();

      // github_installations has `installation_id` globally unique, so this
      // doubles as a WITH CHECK test — RLS blocks before the unique violation.
      const attempt = async () =>
        s.appClient.begin(async (tx) => {
          await tx.unsafe(`SET LOCAL app.current_org_id = '${s.orgA}'`);
          await tx.unsafe(
            `INSERT INTO github_installations
               (tenant_id, installation_id, github_org_id, github_org_login, app_id,
                status, token_ref, webhook_secret_active_ref)
             VALUES ($1, 9999999, 3333, 'attacker_login', 1, 'active', 'r', 'r2')`,
            [s.orgB], // attacker forges tenant = org B while session = org A
          );
        });
      await expect(attempt()).rejects.toThrow();

      // Verify via superuser that no attacker-row landed in org B.
      const rows = (await s.superClient.unsafe(
        `SELECT count(*)::int AS c FROM github_installations
         WHERE tenant_id = $1 AND installation_id = 9999999`,
        [s.orgB],
      )) as unknown as Array<{ c: number }>;
      expect(rows[0]?.c).toBe(0);
    },
  );

  runIfPg(
    "UPDATE of org B's row while session is org A touches 0 rows (USING filters)",
    async () => {
      const s = requireSetup();
      await s.appClient.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL app.current_org_id = '${s.orgA}'`);
        const updated = (await tx.unsafe(
          `UPDATE github_installations SET revoked_at = now()
           WHERE tenant_id = $1
           RETURNING id`,
          [s.orgB],
        )) as unknown as Array<unknown>;
        expect(updated).toHaveLength(0);
      });
      const rows = (await s.superClient.unsafe(
        `SELECT revoked_at FROM github_installations WHERE tenant_id = $1`,
        [s.orgB],
      )) as unknown as Array<{ revoked_at: unknown }>;
      for (const r of rows) expect(r.revoked_at ?? null).toBeNull();
    },
  );

  runIfPg("DELETE of org B's row while session is org A touches 0 rows", async () => {
    const s = requireSetup();
    await s.appClient.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL app.current_org_id = '${s.orgA}'`);
      const deleted = (await tx.unsafe(
        `DELETE FROM repo_id_hash_aliases WHERE tenant_id = $1 RETURNING tenant_id`,
        [s.orgB],
      )) as unknown as Array<unknown>;
      expect(deleted).toHaveLength(0);
    });
    const rows = (await s.superClient.unsafe(
      `SELECT count(*)::int AS c FROM repo_id_hash_aliases WHERE tenant_id = $1`,
      [s.orgB],
    )) as unknown as Array<{ c: number }>;
    expect(rows[0]?.c).toBeGreaterThan(0);
  });

  runIfPg(
    "partitioned table: RLS propagates to session_repo_links partitions (PG 16)",
    async () => {
      const s = requireSetup();

      // Direct SELECT against a partition (bypassing the parent) must still
      // respect RLS per the PRD §9.10 defensive belt-and-suspenders ENABLE
      // + FORCE on each partition in the migration.
      const rowsNoSetting = (await s.appClient.unsafe(
        `SELECT count(*)::int AS c FROM session_repo_links_2026_04`,
      )) as unknown as Array<{ c: number }>;
      expect(rowsNoSetting[0]?.c).toBe(0);

      await s.appClient.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL app.current_org_id = '${s.orgA}'`);
        const rows = (await tx.unsafe(
          `SELECT count(*) FILTER (WHERE tenant_id = '${s.orgB}')::int AS b_leak
           FROM session_repo_links_2026_04`,
        )) as unknown as Array<{ b_leak: number }>;
        expect(rows[0]?.b_leak).toBe(0);
      });
    },
  );
});

if (!PG_LIVE) {
  test("INT9 G1 RLS probes skipped — DATABASE_URL not set", () => {
    expect(true).toBe(true);
  });
}
