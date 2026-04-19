import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openReadOnlyCopy, tryOpenReadOnlyCopy } from "./copyRead";

function makeDb(dir: string): string {
  const p = join(dir, "state.vscdb");
  const db = new Database(p, { create: true });
  db.run("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)");
  db.run("INSERT INTO ItemTable (key, value) VALUES (?, ?)", ["k", "v"]);
  db.close();
  return p;
}

test("openReadOnlyCopy throws on missing source", () => {
  expect(() => openReadOnlyCopy("/does/not/exist/state.vscdb")).toThrow();
});

test("openReadOnlyCopy returns a readable DB against a copy", () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-cursor-copy-"));
  try {
    const src = makeDb(dir);
    const { db, tempDir, cleanup } = openReadOnlyCopy(src);
    try {
      const row = db
        .query<{ value: string }, [string]>("SELECT value FROM ItemTable WHERE key = ?")
        .get("k");
      expect(row?.value).toBe("v");
      expect(existsSync(tempDir)).toBe(true);
    } finally {
      cleanup();
    }
    expect(existsSync(tempDir)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("openReadOnlyCopy enforces readonly: writes fail", () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-cursor-copy-ro-"));
  try {
    const src = makeDb(dir);
    const { db, cleanup } = openReadOnlyCopy(src);
    try {
      expect(() =>
        db.run("INSERT INTO ItemTable (key, value) VALUES (?, ?)", ["x", "y"]),
      ).toThrow();
    } finally {
      cleanup();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("openReadOnlyCopy does not mutate source on parallel copies", () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-cursor-copy-parallel-"));
  try {
    const src = makeDb(dir);
    const r1 = openReadOnlyCopy(src);
    const r2 = openReadOnlyCopy(src);
    r1.cleanup();
    r2.cleanup();
    // Source still readable + writable after both copy-opens closed.
    const live = new Database(src);
    live.run("INSERT INTO ItemTable (key, value) VALUES (?, ?)", ["k2", "v2"]);
    const row = live
      .query<{ value: string }, [string]>("SELECT value FROM ItemTable WHERE key = ?")
      .get("k2");
    expect(row?.value).toBe("v2");
    live.close();
  } finally {
    // Also remove any leftover junk
    rmSync(dir, { recursive: true, force: true });
  }
});

test("openReadOnlyCopy rejects an empty-file source (corrupt SQLite)", () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-cursor-copy-bad-"));
  try {
    const bad = join(dir, "state.vscdb");
    writeFileSync(bad, "NOT_A_SQLITE_FILE");
    expect(() => openReadOnlyCopy(bad)).toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// tryOpenReadOnlyCopy — retry + integrity-check path
// ────────────────────────────────────────────────────────────────────────────

test("tryOpenReadOnlyCopy succeeds on the happy path and records attempts=1", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-cursor-try-"));
  try {
    const src = makeDb(dir);
    const result = await tryOpenReadOnlyCopy(src);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(1);
      result.cleanup();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tryOpenReadOnlyCopy returns {ok:false} for a missing source — no retries", async () => {
  const result = await tryOpenReadOnlyCopy("/does/not/exist/state.vscdb", {
    maxAttempts: 3,
  });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.attempts).toBe(0);
    expect(result.lastError).toMatch(/not found/);
  }
});

test("tryOpenReadOnlyCopy retries on a corrupt file then returns {ok:false} with attempts=3", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-cursor-retry-bad-"));
  try {
    const bad = join(dir, "state.vscdb");
    writeFileSync(bad, "NOT_A_SQLITE_FILE");
    const sleeps: number[] = [];
    const result = await tryOpenReadOnlyCopy(bad, {
      maxAttempts: 3,
      backoffMs: [1, 1, 1],
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attempts).toBe(3);
      expect(result.lastError).toBeDefined();
    }
    // 2 sleeps between 3 attempts.
    expect(sleeps.length).toBe(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tryOpenReadOnlyCopy leaves no temp directories after repeated failures", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-cursor-cleanup-"));
  try {
    const bad = join(dir, "state.vscdb");
    writeFileSync(bad, "NOT_A_SQLITE_FILE");

    const beforeTemp = new Set(
      readdirSync(tmpdir()).filter((n) => n.startsWith("bematist-cursor-")),
    );

    await tryOpenReadOnlyCopy(bad, {
      maxAttempts: 3,
      backoffMs: [0, 0, 0],
      sleep: async () => {},
    });

    const afterTemp = new Set(
      readdirSync(tmpdir()).filter((n) => n.startsWith("bematist-cursor-")),
    );
    // No net growth — every failed attempt cleaned its temp dir.
    for (const t of afterTemp) expect(beforeTemp.has(t)).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tryOpenReadOnlyCopy succeeds once source becomes valid mid-retry (simulated torn copy)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-cursor-heal-"));
  try {
    const p = join(dir, "state.vscdb");
    // Start with garbage (torn copy symptom).
    writeFileSync(p, "NOT_A_SQLITE_FILE");

    let calls = 0;
    const result = await tryOpenReadOnlyCopy(p, {
      maxAttempts: 3,
      backoffMs: [1, 1, 1],
      sleep: async () => {
        calls++;
        if (calls === 1) {
          // Before the second attempt, overwrite with a valid DB.
          rmSync(p, { force: true });
          const seed = new Database(p, { create: true });
          seed.run("CREATE TABLE t (k TEXT)");
          seed.run("INSERT INTO t VALUES (?)", ["v"]);
          seed.close();
        }
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(2);
      result.cleanup();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tryOpenReadOnlyCopy rejects a DB with no tables (empty schema = torn-copy symptom)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-cursor-empty-"));
  try {
    const p = join(dir, "state.vscdb");
    // Create a syntactically-valid SQLite with zero tables — the third
    // validation probe must reject this.
    const db = new Database(p, { create: true });
    db.close();
    const result = await tryOpenReadOnlyCopy(p, {
      maxAttempts: 2,
      backoffMs: [0, 0],
      sleep: async () => {},
    });
    expect(result.ok).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
