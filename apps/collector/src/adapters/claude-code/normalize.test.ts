import { expect, mock, spyOn, test } from "bun:test";
import { join } from "node:path";
import { EventSchema } from "@bematist/schema";
import { log } from "../../logger";
import { normalizeSession, resolveTimestamp } from "./normalize";
import { parseLines, parseSessionFile } from "./parsers/parseSessionFile";

const FIX = join(import.meta.dir, "fixtures");

const baseIdentity = {
  tenantId: "org_acme",
  engineerId: "eng_test",
  deviceId: "dev_test",
  tier: "B" as const,
};

test("every produced event passes EventSchema validation", async () => {
  const parsed = await parseSessionFile(join(FIX, "real-session.jsonl"));
  const events = normalizeSession(parsed, baseIdentity, "1.0.35");
  for (const e of events) {
    const r = EventSchema.safeParse(e);
    expect(r.success).toBe(true);
  }
});

test("event_kind coverage includes session_start, llm_request, llm_response, tool_call, tool_result, session_end", async () => {
  const parsed = await parseSessionFile(join(FIX, "real-session.jsonl"));
  const events = normalizeSession(parsed, baseIdentity, "1.0.35");
  const kinds = new Set(events.map((e) => e.dev_metrics.event_kind));
  for (const k of [
    "session_start",
    "llm_request",
    "llm_response",
    "tool_call",
    "tool_result",
    "session_end",
  ]) {
    expect(kinds.has(k as never)).toBe(true);
  }
});

test("llm_response event stamps pricing_version and cost_usd is > 0", async () => {
  const parsed = await parseSessionFile(join(FIX, "real-session.jsonl"));
  const events = normalizeSession(parsed, baseIdentity, "1.0.35");
  const resp = events.find((e) => e.dev_metrics.event_kind === "llm_response");
  expect(resp?.dev_metrics.pricing_version).toMatch(/^litellm@/);
  expect(resp?.dev_metrics.cost_usd ?? 0).toBeGreaterThan(0);
});

test("client_event_id is deterministic — same input yields same ids", async () => {
  const parsed = await parseSessionFile(join(FIX, "real-session.jsonl"));
  const a = normalizeSession(parsed, baseIdentity, "1.0.35");
  const b = normalizeSession(parsed, baseIdentity, "1.0.35");
  expect(a.map((e) => e.client_event_id)).toEqual(b.map((e) => e.client_event_id));
});

test("event_seq is monotonic within session", async () => {
  const parsed = await parseSessionFile(join(FIX, "real-session.jsonl"));
  const events = normalizeSession(parsed, baseIdentity, "1.0.35");
  for (let i = 1; i < events.length; i++) {
    expect(events[i]?.event_seq ?? 0).toBeGreaterThan(events[i - 1]?.event_seq ?? 0);
  }
});

test("tier defaults to 'B' per CLAUDE.md D7 default", async () => {
  const parsed = await parseSessionFile(join(FIX, "real-session.jsonl"));
  const events = normalizeSession(parsed, baseIdentity, "1.0.35");
  for (const e of events) expect(e.tier).toBe("B");
});

test("fidelity is always 'full' for claude-code", async () => {
  const parsed = await parseSessionFile(join(FIX, "real-session.jsonl"));
  const events = normalizeSession(parsed, baseIdentity, "1.0.35");
  for (const e of events) expect(e.fidelity).toBe("full");
});

test("forbidden fields never appear on emitted events (Tier B)", async () => {
  const parsed = await parseSessionFile(join(FIX, "real-session.jsonl"));
  const events = normalizeSession(parsed, baseIdentity, "1.0.35");
  const forbidden = ["prompt_text", "tool_input", "tool_output"];
  for (const e of events) {
    for (const k of forbidden) {
      expect((e as Record<string, unknown>)[k]).toBeUndefined();
    }
  }
});

// ---- Real `~/.claude/projects/**.jsonl` format coverage ----------------------
// These tests exercise the "real" on-disk format (top-level `type: user | assistant`,
// nested content blocks, `file-history-snapshot` noise) that PR #71 didn't handle.

test("real-projects fixture: produces events that all pass EventSchema", async () => {
  const parsed = await parseSessionFile(join(FIX, "real-projects-session.jsonl"));
  const events = normalizeSession(parsed, baseIdentity, "1.0.35");
  expect(events.length).toBeGreaterThan(0);
  for (const e of events) {
    expect(EventSchema.safeParse(e).success).toBe(true);
  }
});

test("real-projects fixture: synthesizes session_start from first timestamp", async () => {
  const parsed = await parseSessionFile(join(FIX, "real-projects-session.jsonl"));
  const events = normalizeSession(parsed, baseIdentity, "1.0.35");
  expect(events[0]?.dev_metrics.event_kind).toBe("session_start");
});

test("real-projects fixture: assistant messages emit llm_response with usage + cost", async () => {
  const parsed = await parseSessionFile(join(FIX, "real-projects-session.jsonl"));
  const events = normalizeSession(parsed, baseIdentity, "1.0.35");
  const responses = events.filter((e) => e.dev_metrics.event_kind === "llm_response");
  expect(responses.length).toBe(3);
  for (const r of responses) {
    expect(r.gen_ai?.usage?.input_tokens).toBeGreaterThan(0);
    expect(r.dev_metrics.cost_usd ?? 0).toBeGreaterThan(0);
    expect(r.dev_metrics.pricing_version).toMatch(/^litellm@/);
  }
});

test("real-projects fixture: tool_use blocks inside content[] emit tool_call events", async () => {
  const parsed = await parseSessionFile(join(FIX, "real-projects-session.jsonl"));
  const events = normalizeSession(parsed, baseIdentity, "1.0.35");
  const calls = events.filter((e) => e.dev_metrics.event_kind === "tool_call");
  expect(calls.length).toBe(1);
  expect(calls[0]?.dev_metrics.tool_name).toBe("Read");
});

test("real-projects fixture: tool_result blocks in user content[] emit tool_result events", async () => {
  const parsed = await parseSessionFile(join(FIX, "real-projects-session.jsonl"));
  const events = normalizeSession(parsed, baseIdentity, "1.0.35");
  const results = events.filter((e) => e.dev_metrics.event_kind === "tool_result");
  expect(results.length).toBe(2);
  const errored = results.find((e) => e.dev_metrics.tool_status === "error");
  expect(errored).toBeDefined();
  expect(errored?.dev_metrics.first_try_failure).toBe(true);
});

test("real-projects fixture: file-history-snapshot is skipped, not mapped", async () => {
  const parsed = await parseSessionFile(join(FIX, "real-projects-session.jsonl"));
  const events = normalizeSession(parsed, baseIdentity, "1.0.35");
  // Fixture has 1 snapshot + 3 assistant + 2 user (w/ tool_result) + 1 user (plain prompt).
  // Snapshot produces nothing, so events = 1 synth session_start + 3 llm_response + 1 tool_call
  // (from asst-2's tool_use) + 1 llm_request (from plain user prompt "refactor...") + 2 tool_result.
  expect(events.length).toBe(8);
});

// ---- Clock-skew clamp (bug #13a) -------------------------------------------

const NOW_MS = Date.parse("2026-04-19T12:00:00.000Z");

test("resolveTimestamp: within window is preserved", () => {
  const ts = "2026-04-18T12:00:00.000Z"; // 24h ago
  const r = resolveTimestamp(ts, NOW_MS);
  expect(r.clamped).toBe(false);
  expect(r.iso).toBe(new Date(ts).toISOString());
});

test("resolveTimestamp: 8d-old is clamped (outside 7d window)", () => {
  const ts = "2026-04-11T11:00:00.000Z"; // 8d ago
  const r = resolveTimestamp(ts, NOW_MS);
  expect(r.clamped).toBe(true);
  expect(r.iso).toBe(new Date(NOW_MS).toISOString());
});

test("resolveTimestamp: year-2099 future timestamp is clamped", () => {
  const ts = "2099-06-01T00:00:00.000Z";
  const r = resolveTimestamp(ts, NOW_MS);
  expect(r.clamped).toBe(true);
  expect(r.iso).toBe(new Date(NOW_MS).toISOString());
});

test("resolveTimestamp: 2-minute future is within slack (not clamped)", () => {
  const ts = new Date(NOW_MS + 2 * 60 * 1000).toISOString();
  const r = resolveTimestamp(ts, NOW_MS);
  expect(r.clamped).toBe(false);
});

test("resolveTimestamp: 10-minute future is outside slack (clamped)", () => {
  const ts = new Date(NOW_MS + 10 * 60 * 1000).toISOString();
  const r = resolveTimestamp(ts, NOW_MS);
  expect(r.clamped).toBe(true);
});

test("resolveTimestamp: unparseable string clamps to now", () => {
  const r = resolveTimestamp("not-a-date", NOW_MS);
  expect(r.clamped).toBe(true);
  expect(r.iso).toBe(new Date(NOW_MS).toISOString());
});

test("resolveTimestamp: undefined falls back to now (not flagged clamped)", () => {
  const r = resolveTimestamp(undefined, NOW_MS);
  expect(r.clamped).toBe(false);
  expect(r.iso).toBe(new Date(NOW_MS).toISOString());
});

test("normalizeSession: clock-skewed line's ts is clamped to nowMs", () => {
  const parsed = parseLines([
    JSON.stringify({
      type: "user",
      sessionId: "s-skew",
      timestamp: "2099-06-01T00:00:00.000Z",
      message: { role: "user", content: "hi" },
    }),
    JSON.stringify({
      type: "assistant",
      sessionId: "s-skew",
      timestamp: "2099-06-01T00:00:01.000Z",
      requestId: "r-skew",
      message: {
        role: "assistant",
        model: "claude-sonnet-4-6",
        content: [{ type: "text", text: "hey" }],
        usage: { input_tokens: 5, output_tokens: 3 },
      },
    }),
  ]);
  const events = normalizeSession(parsed, baseIdentity, "1.0.35", { nowMs: NOW_MS });
  const nowIso = new Date(NOW_MS).toISOString();
  for (const e of events) {
    expect(e.ts).toBe(nowIso);
  }
});

test("normalizeSession: within-window timestamps are untouched", () => {
  const goodIso = "2026-04-18T12:00:00.000Z"; // 24h before NOW_MS
  const parsed = parseLines([
    JSON.stringify({
      type: "user",
      sessionId: "s-ok",
      timestamp: goodIso,
      message: { role: "user", content: "hi" },
    }),
  ]);
  const events = normalizeSession(parsed, baseIdentity, "1.0.35", { nowMs: NOW_MS });
  expect(events.length).toBeGreaterThan(0);
  for (const e of events) {
    expect(e.ts).toBe(goodIso);
  }
});

test("normalizeSession: Tier C tags clamped events with raw_attrs.schema_drift_note", () => {
  const parsed = parseLines([
    JSON.stringify({
      type: "user",
      sessionId: "s-c",
      timestamp: "2099-01-01T00:00:00.000Z",
      message: { role: "user", content: "hi" },
    }),
  ]);
  const events = normalizeSession(parsed, { ...baseIdentity, tier: "C" }, "1.0.35", {
    nowMs: NOW_MS,
  });
  expect(events.length).toBeGreaterThan(0);
  for (const e of events) {
    expect((e.raw_attrs as Record<string, unknown> | undefined)?.schema_drift_note).toBe(
      "ts_clamped",
    );
  }
});

test("normalizeSession: Tier B does NOT add raw_attrs for clamp (allowlist)", () => {
  const parsed = parseLines([
    JSON.stringify({
      type: "user",
      sessionId: "s-b",
      timestamp: "2099-01-01T00:00:00.000Z",
      message: { role: "user", content: "hi" },
    }),
  ]);
  const events = normalizeSession(parsed, { ...baseIdentity, tier: "B" }, "1.0.35", {
    nowMs: NOW_MS,
  });
  expect(events.length).toBeGreaterThan(0);
  for (const e of events) {
    expect(e.raw_attrs).toBeUndefined();
  }
});

test("normalizeSession: WARN logged exactly once per session on clamp (log-once gate)", () => {
  const spy = spyOn(log, "warn").mockImplementation(mock(() => undefined));
  try {
    const lines: string[] = [];
    for (let i = 0; i < 20; i++) {
      lines.push(
        JSON.stringify({
          type: "user",
          sessionId: "s-loud",
          timestamp: "2099-01-01T00:00:00.000Z",
          message: { role: "user", content: `msg ${i}` },
        }),
      );
    }
    const parsed = parseLines(lines);
    const events = normalizeSession(parsed, baseIdentity, "1.0.35", { nowMs: NOW_MS });
    expect(events.length).toBeGreaterThan(10);

    // Count only our clamp WARN (other code paths may emit their own).
    const clampCalls = spy.mock.calls.filter((args) => {
      const msg = args[args.length - 1];
      return typeof msg === "string" && msg.includes("clamped to collector-received");
    });
    expect(clampCalls.length).toBe(1);
  } finally {
    spy.mockRestore();
  }
});
