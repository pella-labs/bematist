// Server-side timestamp sanity-window validator (bug #13b).
//
// CLAUDE.md §Architecture Rule #9 pins ClickHouse partitions at
// `(toYYYYMM(ts), cityHash64(org_id) % 16)`. A clock-skewed dev machine
// (year 2099, year 1970) would otherwise write events into bogus
// partitions, bloating the parts count, breaking retention worker math,
// and producing unresolvable rows at dashboard-query time.
//
// The collector applies a local clamp too (bug #13a), but defense-in-depth
// mandates the server independently reject events outside a sane window.
// We REJECT, not CLAMP — the server must not silently rewrite client data.
// Clamping is the collector's call; the server's job is to gate CH
// partition keys.
//
// Window defaults (override via env):
//   INGEST_TS_PAST_WINDOW_MS   = 7 days  (7 * 24 * 60 * 60 * 1000)
//   INGEST_TS_FUTURE_WINDOW_MS = 5 min   (5 * 60 * 1000)
//
// Emission: wire format is zod `z.string().datetime()` so we parse ISO
// strings. A non-ISO / un-parseable `ts` is ALSO rejected here (zod would
// reject later anyway, but we want a cheap pre-zod gate so we don't risk
// forwarding garbage into partition-key math).

export const DEFAULT_TS_PAST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_TS_FUTURE_WINDOW_MS = 5 * 60 * 1000;

export interface TsWindowConfig {
  pastMs: number;
  futureMs: number;
}

export function defaultTsWindowConfig(): TsWindowConfig {
  return { pastMs: DEFAULT_TS_PAST_WINDOW_MS, futureMs: DEFAULT_TS_FUTURE_WINDOW_MS };
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export function parseTsWindowConfigFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): TsWindowConfig {
  return {
    pastMs: parseNonNegativeInt(env.INGEST_TS_PAST_WINDOW_MS, DEFAULT_TS_PAST_WINDOW_MS),
    futureMs: parseNonNegativeInt(env.INGEST_TS_FUTURE_WINDOW_MS, DEFAULT_TS_FUTURE_WINDOW_MS),
  };
}

export type TsCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: "TS_UNPARSEABLE" | "TS_PAST_WINDOW" | "TS_FUTURE_WINDOW";
      tsMs: number | null;
    };

/**
 * Check a single `ts` value (ISO8601 string or Date) against the window
 * `[now - pastMs, now + futureMs]`. Non-parseable inputs fail fast.
 */
export function checkTsInWindow(
  ts: unknown,
  nowMs: number,
  cfg: TsWindowConfig = defaultTsWindowConfig(),
): TsCheckResult {
  let tsMs: number;
  if (typeof ts === "string" && ts.length > 0) {
    tsMs = Date.parse(ts);
  } else if (ts instanceof Date) {
    tsMs = ts.getTime();
  } else {
    return { ok: false, reason: "TS_UNPARSEABLE", tsMs: null };
  }
  if (!Number.isFinite(tsMs)) {
    return { ok: false, reason: "TS_UNPARSEABLE", tsMs: null };
  }
  if (tsMs < nowMs - cfg.pastMs) {
    return { ok: false, reason: "TS_PAST_WINDOW", tsMs };
  }
  if (tsMs > nowMs + cfg.futureMs) {
    return { ok: false, reason: "TS_FUTURE_WINDOW", tsMs };
  }
  return { ok: true };
}

/**
 * Single-event rejection response code surfaced at /v1/events and OTLP paths.
 * Shape mirrors the tier-enforcement reject body so clients get a consistent
 * `{code, reason, index, request_id}` envelope.
 */
export const EVENT_TS_OUT_OF_WINDOW_CODE = "EVENT_TS_OUT_OF_WINDOW" as const;
