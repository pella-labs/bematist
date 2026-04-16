import { expect, test } from "bun:test";
import { loadFixture } from "@bematist/fixtures";
import type { Adapter, AdapterContext } from "@bematist/sdk";
import { ClaudeCodeAdapter, claudeCodeAdapter } from "./index";

function mkCtx(): AdapterContext {
  const noop = () => {};
  const log = {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => log,
  };
  return {
    dataDir: "/tmp/bematist-test",
    policy: { enabled: true, tier: "B", pollIntervalMs: 5000 },
    log,
    tier: "B",
    cursor: {
      get: async () => null,
      set: async () => {},
    },
  };
}

test("ClaudeCodeAdapter type-checks against the Adapter interface", () => {
  const a: Adapter = claudeCodeAdapter;
  expect(a.id).toBe("claude-code");
  expect(a.label).toBe("Claude Code");
});

test("poll() returns [] in the seed scaffold (real parser lands in Sprint 1)", async () => {
  const a = new ClaudeCodeAdapter();
  const ctx = mkCtx();
  await a.init(ctx);
  const events = await a.poll(ctx, new AbortController().signal);
  expect(events).toEqual([]);
});

test("health() reports fidelity='full' per CLAUDE.md §Adapter Matrix", async () => {
  const a = new ClaudeCodeAdapter();
  const ctx = mkCtx();
  await a.init(ctx);
  const h = await a.health(ctx);
  expect(h.fidelity).toBe("full");
  expect(["ok", "disabled"]).toContain(h.status);
});

test("golden claude-code fixture loads and every line is a valid Event", () => {
  const events = loadFixture("claude-code");
  expect(events.length).toBeGreaterThanOrEqual(10);
  expect(events.length).toBeLessThanOrEqual(20);
  expect(events[0]?.dev_metrics.event_kind).toBe("session_start");
  expect(events.at(-1)?.dev_metrics.event_kind).toBe("session_end");
  // Required coverage per B-seed spec.
  const kinds = new Set(events.map((e) => e.dev_metrics.event_kind));
  for (const k of [
    "session_start",
    "llm_request",
    "llm_response",
    "tool_call",
    "tool_result",
    "code_edit_proposed",
    "code_edit_decision",
    "session_end",
  ]) {
    expect(kinds.has(k as never)).toBe(true);
  }
  const accepts = events.filter(
    (e) =>
      e.dev_metrics.event_kind === "code_edit_decision" && e.dev_metrics.edit_decision === "accept",
  );
  expect(accepts.length).toBeGreaterThanOrEqual(1);
  // Tier B invariant for seed fixture.
  expect(events.every((e) => e.tier === "B")).toBe(true);
});
