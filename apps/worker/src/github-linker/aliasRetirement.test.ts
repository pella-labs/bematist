// Integration — real Postgres. Proves D55:
//   - archive after retires_at
//   - hard-delete after archived_at + 365d

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres, { type Sql } from "postgres";
import { FsAliasArchiver, runAliasRetirement } from "./aliasRetirement";

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

let tenantId: string;
let archiveDir: string;

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
    VALUES ('alias-retire', ${`alias-retire-${Date.now()}-${Math.random()}`})
    RETURNING id`) as unknown as Array<{ id: string }>;
  tenantId = rows[0]!.id;
  archiveDir = mkdtempSync(join(tmpdir(), "bematist-alias-archive-"));
});

async function cleanup(): Promise<void> {
  await sql.unsafe(`DELETE FROM repo_id_hash_aliases WHERE tenant_id = $1`, [tenantId]);
  await sql.unsafe(`DELETE FROM orgs WHERE id = $1`, [tenantId]);
}

const suite = skip ? describe.skip : describe;

suite("runAliasRetirement — D55 archive + hard-delete", () => {
  test("archives row whose retires_at < now (sets archived_at)", async () => {
    // Seed an alias row whose retires_at is 1h in the past.
    const oldHash = Buffer.alloc(32, 0x01);
    const newHash = Buffer.alloc(32, 0x02);
    await sql.unsafe(
      `INSERT INTO repo_id_hash_aliases
         (tenant_id, old_hash, new_hash, reason, migrated_at, retires_at)
       VALUES ($1, $2, $3, 'rename', now() - interval '181 days', now() - interval '1 hour')`,
      [tenantId, oldHash, newHash],
    );
    const archiver = new FsAliasArchiver(archiveDir);
    const result = await runAliasRetirement(sql, archiver);
    expect(result.archived).toBe(1);
    const rows = await sql<
      Array<{ archived_at: Date | null }>
    >`SELECT archived_at FROM repo_id_hash_aliases WHERE tenant_id = ${tenantId}`;
    expect(rows[0]?.archived_at).not.toBeNull();
    await cleanup();
  });

  test("hard-deletes row whose archived_at is >365d past", async () => {
    const oldHash = Buffer.alloc(32, 0x03);
    const newHash = Buffer.alloc(32, 0x04);
    await sql.unsafe(
      `INSERT INTO repo_id_hash_aliases
         (tenant_id, old_hash, new_hash, reason, migrated_at, retires_at, archived_at)
       VALUES ($1, $2, $3, 'rename',
               now() - interval '550 days',
               now() - interval '370 days',
               now() - interval '366 days')`,
      [tenantId, oldHash, newHash],
    );
    const archiver = new FsAliasArchiver(archiveDir);
    const result = await runAliasRetirement(sql, archiver);
    expect(result.deleted).toBe(1);
    const rows = await sql<
      Array<{ one: number }>
    >`SELECT 1 as one FROM repo_id_hash_aliases WHERE tenant_id = ${tenantId}`;
    expect(rows.length).toBe(0);
    await cleanup();
  });

  test("no-op when all rows are active and not yet retired", async () => {
    const oldHash = Buffer.alloc(32, 0x05);
    const newHash = Buffer.alloc(32, 0x06);
    await sql.unsafe(
      `INSERT INTO repo_id_hash_aliases
         (tenant_id, old_hash, new_hash, reason, migrated_at, retires_at)
       VALUES ($1, $2, $3, 'rename', now(), now() + interval '180 days')`,
      [tenantId, oldHash, newHash],
    );
    const archiver = new FsAliasArchiver(archiveDir);
    const result = await runAliasRetirement(sql, archiver);
    expect(result.archived).toBe(0);
    expect(result.deleted).toBe(0);
    await cleanup();
  });
});
