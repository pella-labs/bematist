import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLines, parseSessionFile } from "./parseSessionFile";

const FIX_DIR = join(import.meta.dir, "..", "fixtures");

test("parses clean session and sums usage correctly", async () => {
  const result = await parseSessionFile(join(FIX_DIR, "duplicate-request-ids.jsonl"));
  // After max-per-requestId dedup: req_abc = {120, 60}, req_xyz = {80, 40}.
  expect(result.usageTotals.input_tokens).toBe(200);
  expect(result.usageTotals.output_tokens).toBe(100);
});

test("dedup by requestId chooses max per field (D17)", async () => {
  const result = await parseSessionFile(join(FIX_DIR, "duplicate-request-ids.jsonl"));
  // req_abc saw {100,50} then {120,60} → max-per-field keeps {120,60}.
  const requestUsages = result.perRequestUsage.get("req_abc");
  expect(requestUsages?.input_tokens).toBe(120);
  expect(requestUsages?.output_tokens).toBe(60);
});

test("durationMs equals lastTimestamp − firstTimestamp", async () => {
  // Fixture spans 14:00:00.000 → 14:00:02.000 = 2000 ms.
  const result = await parseSessionFile(join(FIX_DIR, "duplicate-request-ids.jsonl"));
  expect(result.durationMs).toBe(2000);
});

test("sessionId extracted from first line with one", async () => {
  const result = await parseSessionFile(join(FIX_DIR, "duplicate-request-ids.jsonl"));
  expect(result.sessionId).toBe("s1");
});

test("entries array preserves line order", async () => {
  const result = await parseSessionFile(join(FIX_DIR, "duplicate-request-ids.jsonl"));
  expect(result.entries.length).toBe(3);
  expect(result.entries[0]?.timestamp).toBe("2026-04-16T14:00:00.000Z");
  expect(result.entries[2]?.timestamp).toBe("2026-04-16T14:00:02.000Z");
});

// ---- Byte/line caps (bug #4) -----------------------------------------------

test("parseSessionFile: small files are NOT marked truncated", async () => {
  const result = await parseSessionFile(join(FIX_DIR, "duplicate-request-ids.jsonl"));
  expect(result.truncated).toBe(false);
});

test("parseSessionFile: file over maxFileBytes is tailed and marked truncated", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-cc-bytes-"));
  try {
    const path = join(dir, "big.jsonl");
    const lines: string[] = [];
    for (let i = 0; i < 20; i++) {
      lines.push(
        JSON.stringify({
          type: "message",
          sessionId: "s-big",
          requestId: `rid-${i}`,
          timestamp: "2026-04-18T12:00:00.000Z",
          message: {
            role: "assistant",
            model: "claude-sonnet-4-6",
            usage: { input_tokens: i, output_tokens: i },
          },
        }),
      );
    }
    writeFileSync(path, `${lines.join("\n")}\n`);
    const size = statSync(path).size;

    // Cap to half the file → forces a tail; first partial line dropped.
    const result = await parseSessionFile(path, { maxFileBytes: Math.floor(size / 2) });
    expect(result.truncated).toBe(true);
    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.entries.length).toBeLessThan(20);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parseSessionFile: maxLines cap keeps only the tail lines", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-cc-lines-"));
  try {
    const path = join(dir, "many.jsonl");
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) {
      lines.push(
        JSON.stringify({
          type: "message",
          sessionId: "s-many",
          requestId: `rid-${i}`,
          timestamp: "2026-04-18T12:00:00.000Z",
          message: {
            role: "assistant",
            model: "claude-sonnet-4-6",
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        }),
      );
    }
    writeFileSync(path, `${lines.join("\n")}\n`);

    const result = await parseSessionFile(path, {
      maxFileBytes: 10 * 1024 * 1024,
      maxLines: 10,
    });
    expect(result.truncated).toBe(true);
    expect(result.entries.length).toBe(10);
    // Tail is last 10: requestIds rid-40..rid-49.
    expect(result.entries[0]?.requestId).toBe("rid-40");
    expect(result.entries[9]?.requestId).toBe("rid-49");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parseSessionFile: first partial line after tail is dropped", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-cc-partial-"));
  try {
    const path = join(dir, "partial.jsonl");
    // Long line 1 + short line 2. Cap just above len(line2) → byte tail starts
    // inside line 1.
    const padded = JSON.stringify({
      type: "message",
      sessionId: "s-partial",
      requestId: "LONG",
      timestamp: "2026-04-18T12:00:00.000Z",
      message: { role: "assistant", model: "claude-sonnet-4-6", content: "x".repeat(2000) },
    });
    const clean = JSON.stringify({
      type: "message",
      sessionId: "s-partial",
      requestId: "rid-good",
      timestamp: "2026-04-18T12:00:00.000Z",
      message: {
        role: "assistant",
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    });
    writeFileSync(path, `${padded}\n${clean}\n`);

    const result = await parseSessionFile(path, { maxFileBytes: clean.length + 10 });
    expect(result.truncated).toBe(true);
    const rids = result.entries.map((e) => e.requestId);
    expect(rids).toContain("rid-good");
    expect(rids).not.toContain("LONG");
    expect(result.entries.length).toBeLessThan(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parseLines: exported helper accepts optional truncated flag", () => {
  const result = parseLines([], true);
  expect(result.truncated).toBe(true);
  expect(result.entries.length).toBe(0);
});

// ---- Oversize 600 MiB guard via DI seams (bug #4) -------------------------
// We can't write an actual 600 MiB file in CI and mock.module leaks
// process-wide in Bun, breaking safeRead.test.ts. The ParseSessionFileOpts
// _statSync / _readLinesFromOffset seams let us verify the tail-offset math
// end-to-end without either cost.

test("parseSessionFile: 600 MiB simulation tails at size - 512 MiB, no OOM", async () => {
  const SIX_HUNDRED_MIB = 600 * 1024 * 1024;
  const FIVE_TWELVE_MIB = 512 * 1024 * 1024;
  const calls: Array<{ path: string; offset: number }> = [];

  const result = await parseSessionFile("/fake/path/oversize.jsonl", {
    _statSync: () => ({ size: SIX_HUNDRED_MIB }),
    _readLinesFromOffset: async (path, offset) => {
      calls.push({ path, offset });
      return {
        lines: [
          "PARTIAL_FRAGMENT_THAT_IS_NOT_VALID_JSON",
          JSON.stringify({
            type: "message",
            sessionId: "s-oversize",
            requestId: "rid-A",
            timestamp: "2026-04-18T12:00:00.000Z",
            message: {
              role: "assistant",
              model: "claude-sonnet-4-6",
              usage: { input_tokens: 10, output_tokens: 5 },
            },
          }),
          JSON.stringify({
            type: "message",
            sessionId: "s-oversize",
            requestId: "rid-B",
            timestamp: "2026-04-18T12:00:01.000Z",
            message: {
              role: "assistant",
              model: "claude-sonnet-4-6",
              usage: { input_tokens: 20, output_tokens: 10 },
            },
          }),
        ],
        nextOffset: SIX_HUNDRED_MIB,
      };
    },
  });

  // 1. readLinesFromOffset was invoked exactly once, at the expected offset.
  expect(calls.length).toBe(1);
  expect(calls[0]?.path).toBe("/fake/path/oversize.jsonl");
  expect(calls[0]?.offset).toBe(SIX_HUNDRED_MIB - FIVE_TWELVE_MIB);

  // 2. Truncated flag surfaced so the adapter logs correctly.
  expect(result.truncated).toBe(true);

  // 3. First partial line dropped → only 2 good entries survive.
  expect(result.entries.length).toBe(2);
  expect(result.entries.map((e) => e.requestId)).toEqual(["rid-A", "rid-B"]);

  // 4. Dedup still works end-to-end on the tail.
  expect(result.usageTotals.input_tokens).toBe(30);
  expect(result.usageTotals.output_tokens).toBe(15);
});
