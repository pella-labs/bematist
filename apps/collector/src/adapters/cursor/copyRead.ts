import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

export interface CopyReadResult {
  db: Database;
  tempDir: string;
  cleanup(): void;
}

export interface CopyReadFailure {
  ok: false;
  attempts: number;
  lastError: string;
}

export interface CopyReadSuccess extends CopyReadResult {
  ok: true;
  attempts: number;
}

export interface OpenReadOnlyCopyOptions {
  /** Number of attempts including the first. Defaults to 3. */
  maxAttempts?: number;
  /** Per-attempt delay schedule in ms. Defaults to [50, 150, 500]. */
  backoffMs?: readonly number[];
  /** Async sleep hook, injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_BACKOFF = [50, 150, 500] as const;

/**
 * Copy a SQLite file into a temp dir and open the copy read-only. Cursor holds
 * a writer on the live DB; copy-and-read avoids mutating the source and never
 * risks corrupting it. `readonly: true` enforces query_only at the driver.
 *
 * Legacy entry point: throws on failure. Prefer `tryOpenReadOnlyCopy` in new
 * code — it returns a discriminated result and surfaces retry telemetry.
 */
export function openReadOnlyCopy(sourcePath: string): CopyReadResult {
  if (!existsSync(sourcePath)) {
    throw new Error(`cursor state db not found: ${sourcePath}`);
  }
  statSync(sourcePath);
  const tempDir = mkdtempSync(join(tmpdir(), "bematist-cursor-"));
  const dest = join(tempDir, basename(sourcePath));
  try {
    copyFileSync(sourcePath, dest);
  } catch (e) {
    safeRm(tempDir);
    throw new Error(`cursor state db copy failed: ${sourcePath} (${errStr(e)})`);
  }
  let db: Database;
  try {
    db = new Database(dest, { readonly: true, create: false });
  } catch (e) {
    safeRm(tempDir);
    throw new Error(`cursor state db is not a valid sqlite file: ${sourcePath} (${errStr(e)})`);
  }
  try {
    validateSqlite(db);
  } catch (e) {
    safeClose(db);
    safeRm(tempDir);
    throw new Error(`cursor state db failed validation: ${sourcePath} (${errStr(e)})`);
  }
  return {
    db,
    tempDir,
    cleanup() {
      safeClose(db);
      safeRm(tempDir);
    },
  };
}

/**
 * Robust entry point. Copies the source into a fresh temp dir and validates
 * it via `PRAGMA integrity_check`, `PRAGMA schema_version`, and a sanity
 * probe on `sqlite_schema`. Retries on SQLITE_BUSY or validation failure
 * (torn-copy symptom: live writer mid-transaction) up to `maxAttempts` with
 * exponential backoff. On terminal failure returns `{ok: false}` — the caller
 * can degrade gracefully. Temp dirs are always cleaned up on failure paths.
 */
export async function tryOpenReadOnlyCopy(
  sourcePath: string,
  opts: OpenReadOnlyCopyOptions = {},
): Promise<CopyReadSuccess | CopyReadFailure> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const backoff = opts.backoffMs ?? DEFAULT_BACKOFF;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  if (!existsSync(sourcePath)) {
    return {
      ok: false,
      attempts: 0,
      lastError: `source not found: ${sourcePath}`,
    };
  }

  let lastError = "unknown";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const outcome = attemptCopyOpen(sourcePath);
    if (outcome.ok) {
      return { ...outcome.handle, ok: true, attempts: attempt };
    }
    lastError = outcome.error;
    const retriable = outcome.retriable;
    if (!retriable || attempt === maxAttempts) break;
    const delayMs = backoff[attempt - 1] ?? backoff[backoff.length - 1] ?? 500;
    await sleep(delayMs);
  }
  return { ok: false, attempts: maxAttempts, lastError };
}

interface AttemptOk {
  ok: true;
  handle: CopyReadResult;
}

interface AttemptFail {
  ok: false;
  error: string;
  retriable: boolean;
}

function attemptCopyOpen(sourcePath: string): AttemptOk | AttemptFail {
  let tempDir: string;
  try {
    statSync(sourcePath);
    tempDir = mkdtempSync(join(tmpdir(), "bematist-cursor-"));
  } catch (e) {
    // Source vanished between existsSync and stat, or tmpdir unwritable —
    // treat as retriable (transient FS race) except ENOENT which is terminal.
    const msg = errStr(e);
    const retriable = !/ENOENT/i.test(msg);
    return { ok: false, error: msg, retriable };
  }

  const dest = join(tempDir, basename(sourcePath));
  try {
    copyFileSync(sourcePath, dest);
  } catch (e) {
    safeRm(tempDir);
    const msg = errStr(e);
    // Copy can fail if source is being renamed, journal rolled, etc.
    return { ok: false, error: `copy failed: ${msg}`, retriable: true };
  }

  let db: Database;
  try {
    db = new Database(dest, { readonly: true, create: false });
  } catch (e) {
    safeRm(tempDir);
    const msg = errStr(e);
    return {
      ok: false,
      error: `open failed: ${msg}`,
      retriable: isRetriableOpenError(msg),
    };
  }

  try {
    validateSqlite(db);
  } catch (e) {
    safeClose(db);
    safeRm(tempDir);
    const msg = errStr(e);
    return {
      ok: false,
      error: `validation failed: ${msg}`,
      retriable: true,
    };
  }

  return {
    ok: true,
    handle: {
      db,
      tempDir,
      cleanup() {
        safeClose(db);
        safeRm(tempDir);
      },
    },
  };
}

/**
 * Three-step validation that catches torn copies and partial writes that
 * `PRAGMA schema_version` alone would miss:
 *   1. `PRAGMA integrity_check` must return exactly "ok".
 *   2. `PRAGMA schema_version` must be a positive integer.
 *   3. `SELECT name FROM sqlite_schema LIMIT 1` must run without error.
 */
function validateSqlite(db: Database): void {
  const integrity = db.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get();
  if (!integrity || integrity.integrity_check !== "ok") {
    throw new Error(
      `PRAGMA integrity_check returned ${JSON.stringify(integrity?.integrity_check ?? "(no row)")}`,
    );
  }
  const schemaRow = db.query<{ schema_version: number }, []>("PRAGMA schema_version").get();
  const schemaVersion = schemaRow?.schema_version;
  if (typeof schemaVersion !== "number" || !Number.isFinite(schemaVersion) || schemaVersion <= 0) {
    throw new Error(`PRAGMA schema_version returned ${JSON.stringify(schemaVersion)}`);
  }
  // Sanity probe — confirms sqlite_schema is readable and at least one table
  // exists. An empty-schema DB (no tables at all) is unexpected for Cursor
  // state.vscdb and is treated as a torn copy symptom.
  const probe = db
    .query<{ name: string }, []>("SELECT name FROM sqlite_schema WHERE type='table' LIMIT 1")
    .get();
  if (!probe || !probe.name) {
    throw new Error("sqlite_schema probe returned no tables");
  }
}

function isRetriableOpenError(msg: string): boolean {
  const lower = msg.toLowerCase();
  // bun:sqlite surfaces SQLITE_BUSY via the message; also catch generic
  // "database is locked" and "file is not a database" (torn-copy signature).
  return (
    lower.includes("sqlite_busy") ||
    lower.includes("database is locked") ||
    lower.includes("file is not a database") ||
    lower.includes("disk i/o") ||
    lower.includes("malformed")
  );
}

function safeClose(db: Database): void {
  try {
    db.close();
  } catch {
    // ignore
  }
}

function safeRm(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function errStr(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
