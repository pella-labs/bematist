import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findLastCumulative, parseLines, parseSessionFile } from "./parseSessionFile";

const FIX_DIR = join(import.meta.dir, "..", "fixtures");

test("cumulative token_count is diffed per turn (D17 dollar-accuracy fix)", async () => {
  // turn_1 cumulative 100/50, turn_2 cumulative 200/100 → deltas 100/50 + 100/50 = 200/100.
  // max-per-turn dedup on turn_1 (two snapshots 100 → 120) keeps the 20 extra = 120/60 total.
  const result = await parseSessionFile(join(FIX_DIR, "duplicate-cumulative.jsonl"));
  // turn_1 first snapshot: delta 100/50 (cumulative 100/50 - prior 0).
  // turn_1 second snapshot: delta 20/10 (cumulative 120/60 - prior 100/50).
  // max-per-field of those two deltas for turn_1 → 100/50.
  // turn_2 delta 80/40 (cumulative 200/100 - prior 120/60).
  expect(result.perTurnUsage.get("turn_1")?.input_tokens).toBe(100);
  expect(result.perTurnUsage.get("turn_1")?.output_tokens).toBe(50);
  expect(result.perTurnUsage.get("turn_2")?.input_tokens).toBe(80);
  expect(result.perTurnUsage.get("turn_2")?.output_tokens).toBe(40);
  expect(result.usageTotals.input_tokens).toBe(180);
  expect(result.usageTotals.output_tokens).toBe(90);
});

test("lastCumulative persists the running total for stateful resumption", async () => {
  const result = await parseSessionFile(join(FIX_DIR, "duplicate-cumulative.jsonl"));
  expect(result.lastCumulative).toEqual({
    input_tokens: 200,
    output_tokens: 100,
    cached_input_tokens: 0,
    total_tokens: 300,
  });
});

test("priorCumulative argument lets a resumed tail diff correctly", () => {
  const lines = [
    JSON.stringify({
      session_id: "s1",
      turn_id: "t3",
      timestamp: "2026-04-16T14:00:02.000Z",
      event_msg: {
        type: "token_count",
        payload: {
          model: "gpt-5",
          input_tokens: 200,
          output_tokens: 100,
          cached_input_tokens: 0,
          total_tokens: 300,
        },
      },
    }),
  ];
  const result = parseLines(lines, {
    priorCumulative: {
      input_tokens: 120,
      output_tokens: 60,
      cached_input_tokens: 0,
      total_tokens: 180,
    },
  });
  expect(result.perTurnUsage.get("t3")?.input_tokens).toBe(80);
  expect(result.perTurnUsage.get("t3")?.output_tokens).toBe(40);
});

test("durationMs equals lastTimestamp − firstTimestamp (D17 fix)", async () => {
  const result = await parseSessionFile(join(FIX_DIR, "rollout-real.jsonl"));
  const expected = Date.parse("2026-04-16T14:00:15.000Z") - Date.parse("2026-04-16T14:00:00.000Z");
  expect(result.durationMs).toBe(expected);
});

test("entries array preserves source order; sessionId extracted from first line", async () => {
  const result = await parseSessionFile(join(FIX_DIR, "rollout-real.jsonl"));
  expect(result.sessionId).toBe("sess_codex_01");
  expect(result.entries[0]?.type ?? result.entries[0]?.event_msg?.type).toBe("session_start");
});

test("malformed JSONL lines are skipped without killing the rollout", () => {
  const lines = [
    "not json",
    JSON.stringify({ session_id: "s1", type: "session_start", timestamp: "2026-04-16T14:00:00Z" }),
    "{invalid",
    JSON.stringify({ session_id: "s1", type: "session_end", timestamp: "2026-04-16T14:00:01Z" }),
  ];
  const result = parseLines(lines);
  expect(result.entries.length).toBe(2);
  expect(result.sessionId).toBe("s1");
});

test("newer Codex CLI shape: payload.info.total_token_usage is read as cumulative", async () => {
  // Real-shape fixture: 2 duplicate snapshots at 10843/6656/183, then cumulative
  // grows to 21000/14000/500. Expected:
  //   - First non-null snapshot → delta 10843/183 (prior=0).
  //   - Second duplicate → delta 0 (same cumulative) — max-per-field keeps 10843/183.
  //   - Third snapshot → delta 10157/317 (21000-10843 / 500-183).
  // usageTotals sums deltas across turns; matches the final cumulative 21000/500.
  const result = await parseSessionFile(join(FIX_DIR, "rollout-info-shape.jsonl"));
  expect(result.usageTotals.input_tokens).toBe(21000);
  expect(result.usageTotals.output_tokens).toBe(500);
  expect(result.usageTotals.cached_input_tokens).toBe(14000);
  expect(result.lastCumulative).toEqual({
    input_tokens: 21000,
    output_tokens: 500,
    cached_input_tokens: 14000,
    total_tokens: 21500,
  });
});

test("token_count with payload.info === null is skipped (rate-limit-only ping)", () => {
  const lines = [
    JSON.stringify({
      timestamp: "2026-03-05T02:51:18.911Z",
      type: "event_msg",
      payload: { type: "token_count", info: null, rate_limits: { primary: { used_percent: 1.0 } } },
    }),
    JSON.stringify({
      timestamp: "2026-03-05T02:51:22.006Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 0,
            output_tokens: 50,
            total_tokens: 150,
          },
          last_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 0,
            output_tokens: 50,
            total_tokens: 150,
          },
        },
      },
    }),
  ];
  const result = parseLines(lines);
  // Only ONE turn should be recorded — the info=null ping is ignored.
  expect(result.perTurnUsage.size).toBe(1);
  expect(result.usageTotals.input_tokens).toBe(100);
  expect(result.usageTotals.output_tokens).toBe(50);
});

test("findLastCumulative: returns null on empty file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-find-"));
  try {
    const path = join(dir, "empty.jsonl");
    writeFileSync(path, "");
    const result = await findLastCumulative(path);
    expect(result).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("findLastCumulative: returns latest cumulative from a multi-turn rollout", async () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-find-"));
  try {
    const path = join(dir, "multi.jsonl");
    const content = [
      JSON.stringify({
        type: "session_start",
        session_id: "s",
        timestamp: "2026-04-16T14:00:00Z",
      }),
      JSON.stringify({
        session_id: "s",
        turn_id: "t1",
        timestamp: "2026-04-16T14:00:01Z",
        event_msg: {
          type: "token_count",
          payload: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
        },
      }),
      JSON.stringify({
        session_id: "s",
        turn_id: "t2",
        timestamp: "2026-04-16T14:00:02Z",
        event_msg: {
          type: "token_count",
          payload: { input_tokens: 300, output_tokens: 120, total_tokens: 420 },
        },
      }),
      JSON.stringify({
        session_id: "s",
        turn_id: "t3",
        timestamp: "2026-04-16T14:00:03Z",
        event_msg: {
          type: "token_count",
          payload: {
            input_tokens: 750,
            output_tokens: 300,
            cached_input_tokens: 50,
            total_tokens: 1100,
          },
        },
      }),
      "",
    ].join("\n");
    writeFileSync(path, content);
    const result = await findLastCumulative(path);
    expect(result).toEqual({
      input_tokens: 750,
      output_tokens: 300,
      cached_input_tokens: 50,
      total_tokens: 1100,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("findLastCumulative: respects maxScanBytes cap (partial head line is skipped)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-find-"));
  try {
    const path = join(dir, "capped.jsonl");
    // Write a big filler first snapshot, then a small tail snapshot. With a
    // tight cap we may not reach the big snapshot's line boundary — but we
    // MUST still read the last (small) snapshot.
    const filler = "x".repeat(2048);
    const firstLine = JSON.stringify({
      session_id: "s",
      turn_id: "t1",
      timestamp: "2026-04-16T14:00:00Z",
      filler,
      event_msg: {
        type: "token_count",
        payload: { input_tokens: 111, output_tokens: 22, total_tokens: 133 },
      },
    });
    const lastLine = JSON.stringify({
      session_id: "s",
      turn_id: "t2",
      timestamp: "2026-04-16T14:00:01Z",
      event_msg: {
        type: "token_count",
        payload: { input_tokens: 900, output_tokens: 400, total_tokens: 1300 },
      },
    });
    writeFileSync(path, `${firstLine}\n${lastLine}\n`);

    // Cap smaller than the big first line — forces a partial head to be
    // skipped by JSON.parse; the tail snapshot (900/400) must still surface.
    const result = await findLastCumulative(path, 512);
    expect(result).toEqual({
      input_tokens: 900,
      output_tokens: 400,
      cached_input_tokens: 0,
      total_tokens: 1300,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("findLastCumulative: returns null when no token_count lines are present", async () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-find-"));
  try {
    const path = join(dir, "no-token.jsonl");
    writeFileSync(
      path,
      [
        JSON.stringify({ type: "session_start", session_id: "s", timestamp: "2026-04-16T14:00Z" }),
        JSON.stringify({ type: "session_end", session_id: "s", timestamp: "2026-04-16T14:01Z" }),
        "",
      ].join("\n"),
    );
    const result = await findLastCumulative(path);
    expect(result).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("non-monotonic cumulative snapshots clamp to zero rather than producing negative deltas", () => {
  const lines = [
    JSON.stringify({
      session_id: "s1",
      turn_id: "t1",
      timestamp: "2026-04-16T14:00:00.000Z",
      event_msg: {
        type: "token_count",
        payload: { model: "gpt-5", input_tokens: 50, output_tokens: 25, total_tokens: 75 },
      },
    }),
    JSON.stringify({
      session_id: "s1",
      turn_id: "t2",
      timestamp: "2026-04-16T14:00:01.000Z",
      // Non-monotonic (server clock skew): lower than t1 — must not produce negatives.
      event_msg: {
        type: "token_count",
        payload: { model: "gpt-5", input_tokens: 40, output_tokens: 20, total_tokens: 60 },
      },
    }),
  ];
  const result = parseLines(lines);
  expect(result.perTurnUsage.get("t1")?.input_tokens).toBe(50);
  expect(result.perTurnUsage.get("t2")?.input_tokens).toBe(0);
  expect(result.perTurnUsage.get("t2")?.output_tokens).toBe(0);
});
