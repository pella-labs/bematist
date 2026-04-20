// Tests for the server-side timestamp sanity-window validator (bug #13b).

import { describe, expect, test } from "bun:test";
import {
  checkTsInWindow,
  DEFAULT_TS_FUTURE_WINDOW_MS,
  DEFAULT_TS_PAST_WINDOW_MS,
  defaultTsWindowConfig,
  parseTsWindowConfigFromEnv,
} from "./timestamp";

describe("checkTsInWindow", () => {
  const nowMs = Date.UTC(2026, 3, 19, 12, 0, 0); // 2026-04-19T12:00:00Z
  const cfg = defaultTsWindowConfig();

  test("ISO string inside window → ok", () => {
    const ts = new Date(nowMs - 1000).toISOString();
    expect(checkTsInWindow(ts, nowMs, cfg)).toEqual({ ok: true });
  });

  test("exactly now → ok", () => {
    const ts = new Date(nowMs).toISOString();
    expect(checkTsInWindow(ts, nowMs, cfg)).toEqual({ ok: true });
  });

  test("past-window reject (8 days in the past)", () => {
    const tsMs = nowMs - 8 * 24 * 60 * 60 * 1000;
    const ts = new Date(tsMs).toISOString();
    const r = checkTsInWindow(ts, nowMs, cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("TS_PAST_WINDOW");
      expect(r.tsMs).toBe(tsMs);
    }
  });

  test("future-window reject (10 min ahead)", () => {
    const tsMs = nowMs + 10 * 60 * 1000;
    const ts = new Date(tsMs).toISOString();
    const r = checkTsInWindow(ts, nowMs, cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("TS_FUTURE_WINDOW");
    }
  });

  test("just inside past boundary (6.9d) → ok", () => {
    const ts = new Date(nowMs - 6.9 * 24 * 60 * 60 * 1000).toISOString();
    expect(checkTsInWindow(ts, nowMs, cfg)).toEqual({ ok: true });
  });

  test("just inside future boundary (4.9 min) → ok", () => {
    const ts = new Date(nowMs + 4.9 * 60 * 1000).toISOString();
    expect(checkTsInWindow(ts, nowMs, cfg)).toEqual({ ok: true });
  });

  test("year 2099 far-future → reject", () => {
    const r = checkTsInWindow("2099-01-01T00:00:00.000Z", nowMs, cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("TS_FUTURE_WINDOW");
  });

  test("year 1970 far-past → reject", () => {
    const r = checkTsInWindow("1970-01-01T00:00:00.000Z", nowMs, cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("TS_PAST_WINDOW");
  });

  test("Date instance accepted", () => {
    const d = new Date(nowMs - 1000);
    expect(checkTsInWindow(d, nowMs, cfg)).toEqual({ ok: true });
  });

  test("unparseable ts → TS_UNPARSEABLE", () => {
    expect(checkTsInWindow("not a date", nowMs, cfg).ok).toBe(false);
    expect(checkTsInWindow(null, nowMs, cfg).ok).toBe(false);
    expect(checkTsInWindow(undefined, nowMs, cfg).ok).toBe(false);
    expect(checkTsInWindow(0, nowMs, cfg).ok).toBe(false);
    expect(checkTsInWindow("", nowMs, cfg).ok).toBe(false);
  });

  test("env override: INGEST_TS_PAST_WINDOW_MS=1000 rejects anything >1s old", () => {
    const cfgSmall = parseTsWindowConfigFromEnv({ INGEST_TS_PAST_WINDOW_MS: "1000" });
    const ts = new Date(nowMs - 2000).toISOString();
    const r = checkTsInWindow(ts, nowMs, cfgSmall);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("TS_PAST_WINDOW");
  });

  test("env override: INGEST_TS_FUTURE_WINDOW_MS=1000 rejects >1s future", () => {
    const cfgSmall = parseTsWindowConfigFromEnv({ INGEST_TS_FUTURE_WINDOW_MS: "1000" });
    const ts = new Date(nowMs + 2000).toISOString();
    const r = checkTsInWindow(ts, nowMs, cfgSmall);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("TS_FUTURE_WINDOW");
  });
});

describe("parseTsWindowConfigFromEnv", () => {
  test("defaults when env empty", () => {
    const c = parseTsWindowConfigFromEnv({});
    expect(c.pastMs).toBe(DEFAULT_TS_PAST_WINDOW_MS);
    expect(c.futureMs).toBe(DEFAULT_TS_FUTURE_WINDOW_MS);
  });

  test("parses positive integers", () => {
    const c = parseTsWindowConfigFromEnv({
      INGEST_TS_PAST_WINDOW_MS: "123",
      INGEST_TS_FUTURE_WINDOW_MS: "456",
    });
    expect(c.pastMs).toBe(123);
    expect(c.futureMs).toBe(456);
  });

  test("invalid values fall back to defaults", () => {
    const c = parseTsWindowConfigFromEnv({
      INGEST_TS_PAST_WINDOW_MS: "abc",
      INGEST_TS_FUTURE_WINDOW_MS: "-5",
    });
    expect(c.pastMs).toBe(DEFAULT_TS_PAST_WINDOW_MS);
    expect(c.futureMs).toBe(DEFAULT_TS_FUTURE_WINDOW_MS);
  });
});
