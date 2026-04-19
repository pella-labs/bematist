import { expect, test } from "bun:test";
import type { Event } from "@bematist/schema";
import type { Adapter, AdapterContext, EventEmitter } from "@bematist/sdk";
import { runOnce } from "./index";

function mkLogger() {
  const noop = () => {};
  const l = {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => l,
  };
  return l;
}

function mkCtx(): AdapterContext {
  return {
    dataDir: "/tmp/bematist-test",
    policy: { enabled: true, tier: "B", pollIntervalMs: 5000 },
    log: mkLogger(),
    tier: "B",
    cursor: { get: async () => null, set: async () => {} },
  };
}

function mkAdapter(id: string, events: Event[]): Adapter {
  return {
    id,
    label: id,
    version: "0.0.0",
    supportedSourceVersions: "*",
    async init() {},
    async poll(_ctx, _signal, emit) {
      for (const e of events) emit(e);
    },
    async health() {
      return { status: "ok", fidelity: "full" };
    },
  };
}

function mkThrowingAdapter(id: string, err: unknown): Adapter {
  return {
    id,
    label: id,
    version: "0.0.0",
    supportedSourceVersions: "*",
    async init() {},
    async poll() {
      throw err;
    },
    async health() {
      return { status: "ok", fidelity: "full" };
    },
  };
}

const ev = (id: string): Event =>
  ({
    client_event_id: `00000000-0000-0000-0000-${id.padStart(12, "0")}`,
    schema_version: 1,
    ts: "2026-04-16T14:00:00.000Z",
    tenant_id: "t",
    engineer_id: "e",
    device_id: "d",
    source: "claude-code",
    fidelity: "full",
    tier: "B",
    session_id: "s",
    event_seq: 0,
    dev_metrics: { event_kind: "session_start" },
    cost_estimated: false,
  }) as Event;

function collect(): { emit: EventEmitter; events: Event[] } {
  const events: Event[] = [];
  return { emit: (e) => events.push(e), events };
}

test("runOnce invokes every enabled adapter and streams combined events", async () => {
  const a = mkAdapter("a", [ev("a")]);
  const b = mkAdapter("b", [ev("b"), ev("c")]);
  const { emit, events } = collect();
  await runOnce([a, b], () => mkCtx(), { concurrency: 2, perPollTimeoutMs: 1000 }, emit);
  expect(events.length).toBe(3);
});

test("adapter throwing in poll does not crash the orchestrator", async () => {
  const good = mkAdapter("good", [ev("g")]);
  const bad = mkThrowingAdapter("bad", new Error("kaboom"));
  const { emit, events } = collect();
  await runOnce([good, bad], () => mkCtx(), { concurrency: 2, perPollTimeoutMs: 1000 }, emit);
  expect(events.length).toBe(1);
  expect(events[0]?.client_event_id).toContain("g");
});

test("adapter exceeding perPollTimeoutMs is signaled; emits before abort are kept", async () => {
  // Streaming contract (post-refactor): anything the adapter emitted before
  // abort is already durable on the journal side, so "partial progress" is
  // always retained — regardless of whether the adapter honors the signal.
  // The old test verified the Promise-return path; the new invariant is
  // simpler: emits survive timeout.
  const respectful: Adapter = {
    id: "respectful",
    label: "respectful",
    version: "0.0.0",
    supportedSourceVersions: "*",
    async init() {},
    async poll(_ctx, signal, emit) {
      emit(ev("early"));
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    },
    async health() {
      return { status: "ok", fidelity: "full" };
    },
  };
  const fast = mkAdapter("fast", [ev("ok")]);
  const { emit, events } = collect();
  await runOnce([respectful, fast], () => mkCtx(), { concurrency: 2, perPollTimeoutMs: 50 }, emit);
  expect(events.map((e) => e.client_event_id).some((id) => id.includes("ok"))).toBe(true);
  expect(events.map((e) => e.client_event_id).some((id) => id.includes("early"))).toBe(true);
});
