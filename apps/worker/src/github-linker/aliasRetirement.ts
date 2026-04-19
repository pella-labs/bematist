// Daily alias retirement worker (PRD §9.8 + D55).
//
// For each row in `repo_id_hash_aliases`:
//   - If `retires_at < now()` and `archived_at IS NULL` → export to
//     S3-equivalent (HMAC'd parquet), set `archived_at = now()`.
//   - If `retires_at + 365d < now()` → hard delete.
//
// Production S3 wiring is a deployment concern. For local/test we write
// to a fixture directory (BEMATIST_ALIAS_ARCHIVE_DIR or /tmp/bematist-archive)
// to prove the code path. Swapping in `@aws-sdk/client-s3` is a follow-up.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql } from "postgres";

export interface AliasRetirementResult {
  archived: number;
  deleted: number;
}

export interface AliasArchiver {
  write(tenantId: string, oldHashHex: string, newHashHex: string, row: unknown): Promise<void>;
}

/** Filesystem archiver — writes a JSON line per archived alias. */
export class FsAliasArchiver implements AliasArchiver {
  constructor(private readonly baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
  }
  async write(
    tenantId: string,
    oldHashHex: string,
    newHashHex: string,
    row: unknown,
  ): Promise<void> {
    const filename = `${tenantId}_${oldHashHex}_${newHashHex}.jsonl`;
    const path = join(this.baseDir, filename);
    writeFileSync(path, `${JSON.stringify(row)}\n`, { flag: "a" });
  }
}

export async function runAliasRetirement(
  sql: Sql,
  archiver: AliasArchiver,
  now: Date = new Date(),
): Promise<AliasRetirementResult> {
  // Step 1: archive rows whose retires_at has passed and archived_at is null.
  const archiveCandidates = (await sql.unsafe(
    `SELECT tenant_id, encode(old_hash, 'hex') as old_hash_hex,
            encode(new_hash, 'hex') as new_hash_hex,
            reason, migrated_at, retires_at
       FROM repo_id_hash_aliases
       WHERE retires_at < $1::timestamptz AND archived_at IS NULL`,
    [now.toISOString()],
  )) as unknown as Array<{
    tenant_id: string;
    old_hash_hex: string;
    new_hash_hex: string;
    reason: string;
    migrated_at: string;
    retires_at: string;
  }>;

  let archived = 0;
  for (const row of archiveCandidates) {
    await archiver.write(row.tenant_id, row.old_hash_hex, row.new_hash_hex, row);
    // Mark archived. We match on the full PK to avoid races with a
    // concurrent retirement re-run.
    await sql.unsafe(
      `UPDATE repo_id_hash_aliases
         SET archived_at = $4::timestamptz
         WHERE tenant_id = $1
           AND old_hash = decode($2, 'hex')
           AND new_hash = decode($3, 'hex')
           AND archived_at IS NULL`,
      [row.tenant_id, row.old_hash_hex, row.new_hash_hex, now.toISOString()],
    );
    archived += 1;
  }

  // Step 2: hard delete rows whose archived_at + 365d is past now.
  const deleteRes = (await sql.unsafe(
    `DELETE FROM repo_id_hash_aliases
       WHERE archived_at IS NOT NULL
         AND archived_at < ($1::timestamptz - interval '365 days')`,
    [now.toISOString()],
  )) as unknown as { count?: number };
  const deleted = Number(deleteRes.count ?? 0);

  return { archived, deleted };
}
