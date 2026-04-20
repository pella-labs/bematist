// ClickHouse insert retry wrapper with capped exponential backoff + jitter.
//
// Bug #8 fix: on CH 5xx / network error the WAL consumer previously logged
// and tight-looped against a dead backend under a 10-min CH blip — burning
// CPU and log volume. The Bun↔ClickHouse soak gate (F15 / INT0) expects
// stability, not an unbounded retry storm.
//
// Semantics:
//   - Max attempts default 8 (configurable via `CH_WRITER_MAX_RETRIES`).
//     `attempt` is 0-indexed in backoff math; attempts=1 means "try once,
//     no retry". `attempts=8` means "try once + 7 retries".
//   - Backoff: `min(60_000, 250 * 2^attempt)` + ±10% jitter; capped at 60s
//     so a long outage doesn't push sleep into multi-minute territory.
//   - Retry on: network error (no response, ETIMEDOUT, ECONNRESET, ECONNREFUSED,
//     EAI_AGAIN), HTTP 5xx, 408 Request Timeout, 429 Too Many Requests.
//   - Do NOT retry on 400 (bad schema) / 401 / 403 (auth/authz) — those are
//     client defects that won't resolve on the next attempt. Bubble up so
//     the WAL consumer can dead-letter.
//   - After max retries: throw `CHRetryExhaustedError` carrying the last
//     underlying error + attempt count. The WAL consumer's own outer loop
//     handles the elevated-log + failure-sleep behavior.
//
// Preserves the single-writer pattern (CLAUDE.md §Architecture Rule 7):
// we never issue parallel inserts from a single writer — the retry loop
// is strictly sequential.

import { logger as defaultLogger } from "../logger";

export interface RetryInsertConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** 0..1 jitter fraction (default 0.1 = ±10%). */
  jitter: number;
}

export const defaultRetryInsertConfig: RetryInsertConfig = {
  maxAttempts: 8,
  baseDelayMs: 250,
  maxDelayMs: 60_000,
  jitter: 0.1,
};

export function parseRetryConfigFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  base: RetryInsertConfig = defaultRetryInsertConfig,
): RetryInsertConfig {
  const raw = env.CH_WRITER_MAX_RETRIES;
  if (raw === undefined || raw === "") return base;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return base;
  return { ...base, maxAttempts: n };
}

export interface RetryLogger {
  // biome-ignore lint/suspicious/noExplicitAny: pino-shaped logger accepts any structured payload
  warn: (...a: any[]) => void;
  // biome-ignore lint/suspicious/noExplicitAny: pino-shaped logger accepts any structured payload
  error: (...a: any[]) => void;
}

export interface RetryDeps {
  /** Sleep impl — injectable for tests. Defaults to `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** 0..1 random source — injectable for deterministic jitter in tests. */
  random?: () => number;
  logger?: RetryLogger;
}

export class CHRetryExhaustedError extends Error {
  code = "CH_RETRY_EXHAUSTED" as const;
  attempts: number;
  override cause: unknown;
  constructor(attempts: number, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`clickhouse:retry-exhausted after ${attempts} attempts: ${msg}`);
    this.attempts = attempts;
    this.cause = cause;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compute backoff for attempt `attempt` (0-indexed). `250 * 2^attempt`
 * capped at `maxDelayMs`, then jittered by ±`jitter` fraction using
 * `random` (0..1).
 */
export function computeBackoffMs(
  attempt: number,
  cfg: RetryInsertConfig,
  random: () => number = Math.random,
): number {
  const base = Math.min(cfg.maxDelayMs, cfg.baseDelayMs * 2 ** attempt);
  // ±jitter: random ∈ [0,1) → scale to [-jitter, +jitter).
  const delta = (random() * 2 - 1) * cfg.jitter;
  const withJitter = Math.round(base * (1 + delta));
  // Defensive lower bound — very small delays make no sense.
  return Math.max(0, withJitter);
}

/**
 * Inspect an error thrown by `@clickhouse/client` (or a faked equivalent) and
 * return `true` iff the request should be retried. Network-level errors and
 * transient HTTP statuses retry; client-defect statuses (400/401/403) do not.
 *
 * The @clickhouse/client throws `Error` subclasses with `code` / `status_code`
 * depending on the failure mode. We probe both shapes defensively.
 */
export function isRetryableChError(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  // Network-level: no HTTP response at all.
  const e = err as {
    code?: string;
    status_code?: number;
    statusCode?: number;
    status?: number;
    message?: string;
  };
  const netCodes = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "EPIPE"]);
  if (typeof e.code === "string" && netCodes.has(e.code)) return true;
  const status = e.status_code ?? e.statusCode ?? e.status;
  if (typeof status === "number") {
    if (status === 408 || status === 429) return true;
    if (status >= 500 && status < 600) return true;
    // 4xx other than 408/429 → client defect, never retry.
    if (status >= 400 && status < 500) return false;
  }
  // Fall back to message sniffing for fetch-level failures that surface
  // without a status (e.g. `fetch failed` from undici). Treat as network
  // error — retryable. Explicit 4xx messages from the client library include
  // the status in the string, which the status-code path above catches.
  const msg = typeof e.message === "string" ? e.message : "";
  if (/fetch failed|socket hang up|network error|ECONN/i.test(msg)) return true;
  // Unknown shape — conservative: DO retry. A transient we don't recognize
  // is better served by one more attempt than by silently dropping into the
  // WAL dead-letter stream. The max-attempts cap still bounds us.
  return true;
}

export type InsertFn = (rows: Record<string, unknown>[]) => Promise<unknown>;

/**
 * Wrap an insert function with retry + backoff. Returns a function with the
 * same shape; throws `CHRetryExhaustedError` after exhausting `maxAttempts`.
 */
export function withRetryInsert(
  insertFn: InsertFn,
  cfg: RetryInsertConfig = defaultRetryInsertConfig,
  deps: RetryDeps = {},
): InsertFn {
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;
  const log = deps.logger ?? defaultLogger;
  return async function retryingInsert(rows: Record<string, unknown>[]): Promise<unknown> {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
      try {
        return await insertFn(rows);
      } catch (err) {
        lastErr = err;
        if (!isRetryableChError(err)) {
          // Schema / auth error — bubble up immediately.
          throw err;
        }
        const isLast = attempt === cfg.maxAttempts - 1;
        if (isLast) break;
        const delay = computeBackoffMs(attempt, cfg, random);
        log.warn(
          {
            attempt: attempt + 1,
            max: cfg.maxAttempts,
            delay_ms: delay,
            err: err instanceof Error ? err.message : String(err),
          },
          "clickhouse insert failed — retrying",
        );
        await sleep(delay);
      }
    }
    log.error(
      {
        attempts: cfg.maxAttempts,
        err: lastErr instanceof Error ? lastErr.message : String(lastErr),
      },
      "clickhouse insert failed — retries exhausted",
    );
    throw new CHRetryExhaustedError(cfg.maxAttempts, lastErr);
  };
}
