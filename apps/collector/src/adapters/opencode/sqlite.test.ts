import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildOpenCodeDb } from "./fixtures/build-sqlite";
import { readAllSessions, readSessionsSince } from "./sqlite";

function withDb<T>(fn: (dbPath: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "bematist-oc-sqlite-"));
  const dbPath = join(dir, "storage.sqlite");
  buildOpenCodeDb(dbPath);
  try {
    return fn(dbPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("readSessionsSince(path, null) matches readAllSessions for a cold start", () => {
  withDb((dbPath) => {
    const all = readAllSessions(dbPath);
    const incremental = readSessionsSince(dbPath, null);
    expect(incremental.payloads.length).toBe(all.length);
    expect(incremental.payloads.map((p) => p.session.id).sort()).toEqual(
      all.map((p) => p.session.id).sort(),
    );
    expect(incremental.nextWatermark).not.toBeNull();
  });
});

test("readSessionsSince returns empty + null watermark when nothing exceeds the cursor", () => {
  withDb((dbPath) => {
    const first = readSessionsSince(dbPath, null);
    expect(first.nextWatermark).not.toBeNull();
    const second = readSessionsSince(dbPath, first.nextWatermark);
    expect(second.payloads).toEqual([]);
    expect(second.nextWatermark).toBeNull();
  });
});

test("readSessionsSince only returns sessions strictly newer than the watermark", () => {
  withDb((dbPath) => {
    const t0 = Date.parse("2026-04-16T15:00:00.000Z");

    // Add two new sessions: one at t0+60s (should be visible when watermark < that),
    // one at t0+120s.
    const db = new Database(dbPath);
    try {
      db.run("INSERT INTO sessions (id, title, time_created, time_updated) VALUES (?, ?, ?, ?)", [
        "sess_after_1",
        "newer 1",
        t0 + 60_000,
        t0 + 60_000,
      ]);
      db.run("INSERT INTO sessions (id, title, time_created, time_updated) VALUES (?, ?, ?, ?)", [
        "sess_after_2",
        "newer 2",
        t0 + 120_000,
        t0 + 120_000,
      ]);
    } finally {
      db.close();
    }

    // Watermark between the original fixture's last session and the two new ones.
    const watermark = new Date(t0 + 30_000).toISOString();
    const incremental = readSessionsSince(dbPath, watermark);
    const ids = incremental.payloads.map((p) => p.session.id).sort();
    expect(ids).toEqual(["sess_after_1", "sess_after_2"]);
    expect(incremental.nextWatermark).toBe(new Date(t0 + 120_000).toISOString());
  });
});

test("readSessionsSince advances the watermark to max(time_updated) across the window", () => {
  withDb((dbPath) => {
    const t0 = Date.parse("2026-04-16T15:00:00.000Z");
    const db = new Database(dbPath);
    try {
      // Insert with out-of-order time_updated values to be sure we pick the MAX,
      // not the last row we happened to return.
      db.run("INSERT INTO sessions (id, title, time_created, time_updated) VALUES (?, ?, ?, ?)", [
        "sess_x",
        "x",
        t0 + 100_000,
        t0 + 500_000, // highest
      ]);
      db.run("INSERT INTO sessions (id, title, time_created, time_updated) VALUES (?, ?, ?, ?)", [
        "sess_y",
        "y",
        t0 + 110_000,
        t0 + 200_000,
      ]);
    } finally {
      db.close();
    }
    const result = readSessionsSince(dbPath, new Date(t0 + 50_000).toISOString());
    expect(result.nextWatermark).toBe(new Date(t0 + 500_000).toISOString());
  });
});

test("readSessionsSince respects maxRows and returns in time_updated ASC order", () => {
  withDb((dbPath) => {
    const t0 = Date.parse("2026-04-16T15:00:00.000Z");
    const db = new Database(dbPath);
    try {
      for (let i = 0; i < 5; i++) {
        db.run("INSERT INTO sessions (id, title, time_created, time_updated) VALUES (?, ?, ?, ?)", [
          `sess_batch_${i}`,
          `batch ${i}`,
          t0 + 1_000_000 + i,
          t0 + 1_000_000 + i * 1000,
        ]);
      }
    } finally {
      db.close();
    }
    const result = readSessionsSince(dbPath, new Date(t0 + 900_000).toISOString(), 3);
    expect(result.payloads.length).toBe(3);
    expect(result.payloads.map((p) => p.session.id)).toEqual([
      "sess_batch_0",
      "sess_batch_1",
      "sess_batch_2",
    ]);
    // Watermark = time_updated of the 3rd row → next tick starts from batch_3.
    expect(result.nextWatermark).toBe(new Date(t0 + 1_000_000 + 2 * 1000).toISOString());
  });
});

test("readSessionsSince tolerates a malformed watermark by re-scanning everything", () => {
  withDb((dbPath) => {
    const result = readSessionsSince(dbPath, "not-a-date");
    // Falling back to epoch 0 → returns every session (same as first-run).
    expect(result.payloads.length).toBeGreaterThan(0);
    expect(result.nextWatermark).not.toBeNull();
  });
});
