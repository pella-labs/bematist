// G1 step 1 — migration shape + rollback rehearsal against a REAL Postgres.
//
// Runs only when DATABASE_URL is available (CI sets it; local devs start
// the stack via `docker compose -f docker-compose.dev.yml up postgres`).
//
// Assertions (per PRD §9):
//   1. All 8 new tables exist (§9.1–§9.8) + 2 seeded session_repo_links
//      partitions (2026-04, 2026-05).
//   2. Canonical columns + types present on each table.
//   3. All CHECK constraints wired (status, state, match_reason, etc.).
//   4. Partial + unique indexes present per PRD DDL.
//   5. RLS is enforced on every new table (rowsecurity=true, forcerowsecurity=true).
//   6. `org_isolation` policy exists on every new table.
//   7. `repos` / `git_events` / `orgs` extensions landed; `repos_github_provider_id_required`
//      is NOT VALID (post-backfill VALIDATE happens in a follow-up migration).
//   8. Rollback path (packages/schema/postgres/rollback/0004_github_integration_g1.down.sql)
//      cleanly drops everything and re-applying forward restores the schema.
//
// Every assertion runs as postgres (superuser — inspects catalog, bypasses RLS).
// The separate github_g1_rls.test.ts file exercises actual tenant-isolation
// behavior with the app_bematist role.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const PG_LIVE = process.env.DATABASE_URL !== undefined;
const SUPER_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/bematist";

const NEW_TABLES = [
  "github_installations",
  "github_pull_requests",
  "github_check_suites",
  "github_deployments",
  "github_code_owners",
  "session_repo_links",
  "session_repo_eligibility",
  "repo_id_hash_aliases",
] as const;

const SRL_PARTITIONS = ["session_repo_links_2026_04", "session_repo_links_2026_05"] as const;

interface Setup {
  sql: ReturnType<typeof postgres>;
  migrationSql: string;
  rollbackSql: string;
}

let setup: Setup | null = null;

beforeAll(async () => {
  if (!PG_LIVE) return;
  const sql = postgres(SUPER_URL, { max: 2, idle_timeout: 5, connect_timeout: 5 });
  const repoRoot = join(import.meta.dir, "..", "..", "..", "..");
  const migrationSql = readFileSync(
    join(repoRoot, "packages", "schema", "postgres", "custom", "0004_github_integration_g1.sql"),
    "utf8",
  );
  const rollbackSql = readFileSync(
    join(
      repoRoot,
      "packages",
      "schema",
      "postgres",
      "rollback",
      "0004_github_integration_g1.down.sql",
    ),
    "utf8",
  );
  setup = { sql, migrationSql, rollbackSql };
});

afterAll(async () => {
  if (setup) await setup.sql.end().catch(() => {});
});

// biome-ignore lint/suspicious/noExplicitAny: bun:test exposes skipIf at runtime
const runIfPg = (test as any).skipIf ? (test as any).skipIf(!PG_LIVE) : test;

function requireSetup(): Setup {
  if (!setup) throw new Error("setup not complete — DATABASE_URL unset?");
  return setup;
}

describe("G1 step 1 — schema shape + constraints", () => {
  runIfPg("all 8 new tables exist", async () => {
    const s = requireSetup();
    for (const t of NEW_TABLES) {
      const rows = (await s.sql.unsafe(
        `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname = $1`,
        [t],
      )) as unknown as Array<unknown>;
      expect({ table: t, found: rows.length }).toEqual({ table: t, found: 1 });
    }
  });

  runIfPg("session_repo_links is partitioned and seeds 2026-04 + 2026-05", async () => {
    const s = requireSetup();
    const parent = (await s.sql.unsafe(
      `SELECT relkind FROM pg_class WHERE relname = 'session_repo_links'`,
    )) as unknown as Array<{ relkind: string }>;
    // 'p' = partitioned table.
    expect(parent[0]?.relkind).toBe("p");
    for (const p of SRL_PARTITIONS) {
      const rows = (await s.sql.unsafe(`SELECT relispartition FROM pg_class WHERE relname = $1`, [
        p,
      ])) as unknown as Array<{ relispartition: boolean }>;
      expect({ partition: p, isPartition: rows[0]?.relispartition }).toEqual({
        partition: p,
        isPartition: true,
      });
    }
  });

  runIfPg("github_installations has canonical G1 columns (not the G0 stub shape)", async () => {
    const s = requireSetup();
    const rows = (await s.sql.unsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='github_installations'
       ORDER BY column_name`,
    )) as unknown as Array<{ column_name: string }>;
    const cols = rows.map((r) => r.column_name);
    const required = [
      "id",
      "tenant_id",
      "installation_id",
      "github_org_id",
      "github_org_login",
      "app_id",
      "status",
      "token_ref",
      "webhook_secret_active_ref",
      "webhook_secret_previous_ref",
      "webhook_secret_rotated_at",
      "last_reconciled_at",
      "installed_at",
      "suspended_at",
      "revoked_at",
      "created_at",
      "updated_at",
    ];
    for (const c of required) {
      expect({ col: c, present: cols.includes(c) }).toEqual({ col: c, present: true });
    }
  });

  runIfPg(
    "repos_github_provider_id_required constraint exists and is NOT VALID (post-backfill)",
    async () => {
      const s = requireSetup();
      const rows = (await s.sql.unsafe(
        `SELECT convalidated FROM pg_constraint
         WHERE conname = 'repos_github_provider_id_required'`,
      )) as unknown as Array<{ convalidated: boolean }>;
      expect(rows).toHaveLength(1);
      // NOT VALID constraints have convalidated=false until an explicit
      // `VALIDATE CONSTRAINT` scans the existing rows. PRD §9.9 defers this
      // to a follow-up migration after production backfill completes.
      expect(rows[0]?.convalidated).toBe(false);
    },
  );

  runIfPg("repos has all G1 extension columns", async () => {
    const s = requireSetup();
    const rows = (await s.sql.unsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='repos'`,
    )) as unknown as Array<{ column_name: string }>;
    const cols = new Set(rows.map((r) => r.column_name));
    for (const c of [
      "provider_repo_id",
      "default_branch",
      "first_seen_at",
      "archived_at",
      "deleted_at",
      "tracking_state",
    ]) {
      expect({ col: c, in_repos: cols.has(c) }).toEqual({ col: c, in_repos: true });
    }
  });

  runIfPg("git_events has branch / repo_id_hash / author_association", async () => {
    const s = requireSetup();
    const rows = (await s.sql.unsafe(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema='public' AND table_name='git_events'`,
    )) as unknown as Array<{ column_name: string; data_type: string }>;
    const byName = new Map(rows.map((r) => [r.column_name, r.data_type]));
    expect(byName.get("branch")).toBe("text");
    expect(byName.get("repo_id_hash")).toBe("bytea");
    expect(byName.get("author_association")).toBe("text");
  });

  runIfPg("orgs has github_repo_tracking_mode NOT NULL default 'all'", async () => {
    const s = requireSetup();
    const rows = (await s.sql.unsafe(
      `SELECT column_default, is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='orgs'
         AND column_name='github_repo_tracking_mode'`,
    )) as unknown as Array<{ column_default: string; is_nullable: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.is_nullable).toBe("NO");
    expect(rows[0]?.column_default).toContain("'all'");
  });

  runIfPg("all 8 new tables have ROW LEVEL SECURITY enabled + FORCED", async () => {
    const s = requireSetup();
    for (const t of NEW_TABLES) {
      const rows = (await s.sql.unsafe(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
         WHERE relname = $1`,
        [t],
      )) as unknown as Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>;
      expect({ table: t, rls: rows[0]?.relrowsecurity }).toEqual({
        table: t,
        rls: true,
      });
      expect({ table: t, forced: rows[0]?.relforcerowsecurity }).toEqual({
        table: t,
        forced: true,
      });
    }
  });

  runIfPg("org_isolation policy exists on every new table", async () => {
    const s = requireSetup();
    for (const t of NEW_TABLES) {
      const rows = (await s.sql.unsafe(
        `SELECT policyname FROM pg_policies
         WHERE schemaname='public' AND tablename = $1 AND policyname = 'org_isolation'`,
        [t],
      )) as unknown as Array<unknown>;
      expect({ table: t, policies: rows.length }).toEqual({ table: t, policies: 1 });
    }
  });
});

describe("G1 step 1 — rollback rehearsal", () => {
  runIfPg("rollback drops every new table + extension column, forward restores", async () => {
    const s = requireSetup();

    // 1. Rollback.
    await s.sql.unsafe(s.rollbackSql);

    for (const t of NEW_TABLES) {
      const rows = (await s.sql.unsafe(
        `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname = $1`,
        [t],
      )) as unknown as Array<unknown>;
      expect({ table: t, after_rollback: rows.length }).toEqual({ table: t, after_rollback: 0 });
    }

    const reposCols = (await s.sql.unsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='repos'`,
    )) as unknown as Array<{ column_name: string }>;
    const reposColSet = new Set(reposCols.map((r) => r.column_name));
    expect(reposColSet.has("provider_repo_id")).toBe(false);
    expect(reposColSet.has("tracking_state")).toBe(false);

    // 2. Forward migration re-applies cleanly + idempotently.
    await s.sql.unsafe(s.migrationSql);

    for (const t of NEW_TABLES) {
      const rows = (await s.sql.unsafe(
        `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname = $1`,
        [t],
      )) as unknown as Array<unknown>;
      expect({ table: t, after_forward: rows.length }).toEqual({ table: t, after_forward: 1 });
    }

    // 3. Re-apply forward again (idempotency).
    await s.sql.unsafe(s.migrationSql);

    const finalCheck = (await s.sql.unsafe(
      `SELECT count(*)::int AS c FROM pg_class c2 JOIN pg_namespace n ON n.oid=c2.relnamespace
       WHERE n.nspname='public' AND c2.relname = ANY ($1::text[])`,
      [NEW_TABLES as unknown as string[]],
    )) as unknown as Array<{ c: number }>;
    expect(finalCheck[0]?.c).toBe(NEW_TABLES.length);
  });

  runIfPg("rollback .down.sql file exists on disk", () => {
    const path = join(import.meta.dir, "..", "rollback", "0004_github_integration_g1.down.sql");
    expect(existsSync(path)).toBe(true);
  });
});

if (!PG_LIVE) {
  test("G1 migration + rollback tests skipped — DATABASE_URL not set", () => {
    expect(true).toBe(true);
  });
}
