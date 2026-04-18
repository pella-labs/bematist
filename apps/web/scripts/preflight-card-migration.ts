#!/usr/bin/env bun
/*
 * Preflight for the Firebase → Better Auth /card migration.
 *
 * Verifies:
 *   1. Required env vars are present (DATABASE_URL, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET).
 *   2. We can open a Postgres connection with DATABASE_URL.
 *   3. The control-plane tables the migration depends on already exist
 *      (better_auth_user/session/account/verification + users).
 *   4. The target tables (card_tokens, cards) do NOT yet exist — if they do,
 *      a prior migration ran or a name collision needs resolving.
 *   5. The current Postgres role has CREATE/DROP privileges on the schema.
 *
 * Never prints secret values. Prints host/dbname/role so the operator can
 * confirm the connection points at the expected database.
 *
 * Run:
 *   bun --env-file=.env run apps/web/scripts/preflight-card-migration.ts
 */

import postgres from "postgres";

type CheckResult = { name: string; ok: boolean; detail?: string };

const results: CheckResult[] = [];
let hardFail = false;

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  if (!ok) hardFail = true;
}

function envPresent(key: string): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.length > 0;
}

// --- 1. Env vars -----------------------------------------------------------
const requiredEnv = ["DATABASE_URL", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"];
for (const key of requiredEnv) {
  record(`env:${key}`, envPresent(key), envPresent(key) ? "set" : "missing");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  printReport();
  process.exit(1);
}

// Parse the URL for display — never print the password. Surfacing
// host/port/db up front lets the operator catch "pointing at the wrong
// instance" before we even try to connect.
try {
  const u = new URL(databaseUrl);
  const host = u.hostname || "(none)";
  const port = u.port || "5432";
  const db = u.pathname.replace(/^\//, "") || "(none)";
  const user = u.username || "(none)";
  record("db:target", true, `user=${user} host=${host} port=${port} db=${db}`);
} catch (err) {
  record("db:target", false, `DATABASE_URL is not a valid URL: ${(err as Error).message}`);
  printReport();
  process.exit(1);
}

// --- 2-5. Database connectivity and schema --------------------------------
const sql = postgres(databaseUrl, { max: 1, idle_timeout: 5, connect_timeout: 5 });

try {
  // 2. Connectivity — also pulls identity metadata so the operator can
  // eyeball that they're pointing at the right DB instance.
  const [meta] = await sql<{ db: string; host: string; role: string; version: string }[]>`
    SELECT
      current_database() AS db,
      inet_server_addr()::text AS host,
      current_user         AS role,
      current_setting('server_version') AS version
  `;
  record(
    "db:connect",
    true,
    `db=${meta.db} host=${meta.host ?? "local-socket"} role=${meta.role} pg=${meta.version}`,
  );

  // 3. Required existing tables.
  const requiredTables = [
    "users",
    "better_auth_user",
    "better_auth_session",
    "better_auth_account",
    "better_auth_verification",
  ];
  const existing = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename = ANY(${requiredTables})
  `;
  const have = new Set(existing.map((r) => r.tablename));
  for (const t of requiredTables) {
    record(`table:${t}`, have.has(t), have.has(t) ? "present" : "MISSING — run db:migrate:pg first");
  }

  // 4. Target tables must not exist yet. If they do, bail loudly — something
  // is out of phase with the plan.
  const targetTables = ["card_tokens", "cards"];
  const clashes = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename = ANY(${targetTables})
  `;
  for (const t of targetTables) {
    const present = clashes.some((r) => r.tablename === t);
    record(
      `target-unused:${t}`,
      !present,
      present ? "ALREADY EXISTS — investigate before migrating" : "clear",
    );
  }

  // 5. DDL privilege — create a throwaway table, then drop it. Unique suffix
  // so two operators running preflight simultaneously don't collide.
  const probe = `_preflight_probe_${Math.random().toString(36).slice(2, 10)}`;
  try {
    await sql.unsafe(`CREATE TABLE ${probe} (id int)`);
    await sql.unsafe(`DROP TABLE ${probe}`);
    record("db:ddl", true, "CREATE/DROP succeeded");
  } catch (err) {
    record("db:ddl", false, err instanceof Error ? err.message : String(err));
  }
} catch (err) {
  // `postgres` throws a PostgresError with structured fields (code, severity,
  // detail). Plain Error.message is often just "CONNECTION_ENDED" / "ECONNREFUSED";
  // the structured fields are where the useful diagnosis lives.
  const e = err as Partial<{ message: string; code: string; errno: string; detail: string }>;
  const parts = [
    e.code ? `code=${e.code}` : null,
    e.errno ? `errno=${e.errno}` : null,
    e.message || String(err),
    e.detail ? `detail=${e.detail}` : null,
  ].filter(Boolean);
  record("db:connect", false, parts.join(" | "));
} finally {
  await sql.end({ timeout: 2 });
}

printReport();
process.exit(hardFail ? 1 : 0);

function printReport(): void {
  const pad = (s: string, n: number) => s.padEnd(n);
  let width = 0;
  for (const r of results) width = Math.max(width, r.name.length);
  console.log("\nPreflight — /card migration (Firebase → Better Auth)\n");
  for (const r of results) {
    const mark = r.ok ? "PASS" : "FAIL";
    const line = `  [${mark}] ${pad(r.name, width)}  ${r.detail ?? ""}`;
    console.log(line);
  }
  console.log(`\n${hardFail ? "FAIL" : "OK"} — ${results.length} check(s)\n`);
}
