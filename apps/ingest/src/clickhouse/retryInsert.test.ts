// Tests for the ClickHouse insert retry wrapper (bug #8).
//
// Verifies:
//   - transient 5xx retries, succeeds on Nth attempt
//   - 4xx bubbles up immediately (no retries)
//   - retry exhaustion throws `CHRetryExhaustedError`
//   - backoff timing follows `min(60_000, 250 * 2^attempt) + ±jitter`
//     (asserted via injected fake sleep / deterministic random)

import { describe, expect, test } from "bun:test";
import {
  CHRetryExhaustedError,
  computeBackoffMs,
  defaultRetryInsertConfig,
  isRetryableChError,
  parseRetryConfigFromEnv,
  type RetryInsertConfig,
  withRetryInsert,
} from "./retryInsert";

const silentLogger = { warn: () => {}, error: () => {} };

describe("isRetryableChError", () => {
  test("network codes ETIMEDOUT / ECONNRESET / ECONNREFUSED retry", () => {
    for (const code of ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "EPIPE"]) {
      const err = Object.assign(new Error(`net ${code}`), { code });
      expect(isRetryableChError(err)).toBe(true);
    }
  });

  test("5xx retries; 4xx (except 408/429) does NOT retry", () => {
    expect(isRetryableChError({ status_code: 500 })).toBe(true);
    expect(isRetryableChError({ statusCode: 502 })).toBe(true);
    expect(isRetryableChError({ status: 503 })).toBe(true);
    expect(isRetryableChError({ status_code: 504 })).toBe(true);
    expect(isRetryableChError({ status_code: 400 })).toBe(false);
    expect(isRetryableChError({ status_code: 401 })).toBe(false);
    expect(isRetryableChError({ status_code: 403 })).toBe(false);
    expect(isRetryableChError({ status_code: 404 })).toBe(false);
  });

  test("408 and 429 retry", () => {
    expect(isRetryableChError({ status_code: 408 })).toBe(true);
    expect(isRetryableChError({ status_code: 429 })).toBe(true);
  });

  test("undici 'fetch failed' string retries", () => {
    expect(isRetryableChError(new Error("fetch failed"))).toBe(true);
    expect(isRetryableChError(new Error("socket hang up"))).toBe(true);
  });
});

describe("computeBackoffMs", () => {
  test("base doubles: 250, 500, 1000, 2000, 4000, ...", () => {
    const cfg: RetryInsertConfig = { ...defaultRetryInsertConfig, jitter: 0 };
    expect(computeBackoffMs(0, cfg, () => 0.5)).toBe(250);
    expect(computeBackoffMs(1, cfg, () => 0.5)).toBe(500);
    expect(computeBackoffMs(2, cfg, () => 0.5)).toBe(1000);
    expect(computeBackoffMs(3, cfg, () => 0.5)).toBe(2000);
    expect(computeBackoffMs(4, cfg, () => 0.5)).toBe(4000);
  });

  test("cap at 60_000ms for large attempts", () => {
    const cfg: RetryInsertConfig = { ...defaultRetryInsertConfig, jitter: 0 };
    // 250 * 2^20 → ~260M ms; must clamp at 60_000.
    expect(computeBackoffMs(20, cfg, () => 0.5)).toBe(60_000);
    expect(computeBackoffMs(100, cfg, () => 0.5)).toBe(60_000);
  });

  test("jitter ±10% default", () => {
    const cfg = defaultRetryInsertConfig; // jitter 0.1
    // random=0 → delta = -0.1; 250 * 0.9 = 225
    expect(computeBackoffMs(0, cfg, () => 0)).toBe(225);
    // random=1 → delta = +0.1; 250 * 1.1 = 275
    // (Math.round applied)
    expect(computeBackoffMs(0, cfg, () => 1)).toBe(275);
  });
});

describe("parseRetryConfigFromEnv", () => {
  test("default when unset", () => {
    expect(parseRetryConfigFromEnv({}).maxAttempts).toBe(8);
  });
  test("CH_WRITER_MAX_RETRIES=3 override", () => {
    expect(parseRetryConfigFromEnv({ CH_WRITER_MAX_RETRIES: "3" }).maxAttempts).toBe(3);
  });
  test("invalid values fall back to default", () => {
    expect(parseRetryConfigFromEnv({ CH_WRITER_MAX_RETRIES: "abc" }).maxAttempts).toBe(8);
    expect(parseRetryConfigFromEnv({ CH_WRITER_MAX_RETRIES: "0" }).maxAttempts).toBe(8);
    expect(parseRetryConfigFromEnv({ CH_WRITER_MAX_RETRIES: "-5" }).maxAttempts).toBe(8);
  });
});

describe("withRetryInsert", () => {
  test("succeeds on first attempt with no retries", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      return { ok: true };
    };
    const wrapped = withRetryInsert(fn, defaultRetryInsertConfig, { logger: silentLogger });
    await wrapped([{ a: 1 }]);
    expect(calls).toBe(1);
  });

  test("retries on transient 5xx; succeeds on 3rd attempt", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const fn = async () => {
      calls++;
      if (calls < 3) {
        throw Object.assign(new Error("ch 503"), { status_code: 503 });
      }
      return { ok: true };
    };
    const wrapped = withRetryInsert(
      fn,
      { ...defaultRetryInsertConfig, jitter: 0 },
      {
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        random: () => 0.5,
        logger: silentLogger,
      },
    );
    await wrapped([{ a: 1 }]);
    expect(calls).toBe(3);
    // Two sleeps: 250ms, 500ms (no jitter).
    expect(sleeps).toEqual([250, 500]);
  });

  test("no retry on 400 — bubbles up immediately", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw Object.assign(new Error("bad schema"), { status_code: 400 });
    };
    const wrapped = withRetryInsert(fn, defaultRetryInsertConfig, {
      logger: silentLogger,
      sleep: async () => {},
    });
    let threw: Error | null = null;
    try {
      await wrapped([{ a: 1 }]);
    } catch (e) {
      threw = e as Error;
    }
    expect(calls).toBe(1);
    expect(threw).not.toBeNull();
    expect(threw?.message).toContain("bad schema");
  });

  test("no retry on 401 or 403", async () => {
    for (const code of [401, 403]) {
      let calls = 0;
      const fn = async () => {
        calls++;
        throw Object.assign(new Error(`auth ${code}`), { status_code: code });
      };
      const wrapped = withRetryInsert(fn, defaultRetryInsertConfig, {
        logger: silentLogger,
        sleep: async () => {},
      });
      await wrapped([{ a: 1 }]).catch(() => {});
      expect(calls).toBe(1);
    }
  });

  test("max-retries throws CHRetryExhaustedError after N attempts", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw Object.assign(new Error("sustained 503"), { status_code: 503 });
    };
    const cfg: RetryInsertConfig = { ...defaultRetryInsertConfig, maxAttempts: 4, jitter: 0 };
    const wrapped = withRetryInsert(fn, cfg, {
      logger: silentLogger,
      sleep: async () => {},
      random: () => 0.5,
    });
    let threw: unknown = null;
    try {
      await wrapped([{ a: 1 }]);
    } catch (e) {
      threw = e;
    }
    expect(calls).toBe(4);
    expect(threw).toBeInstanceOf(CHRetryExhaustedError);
    expect((threw as CHRetryExhaustedError).attempts).toBe(4);
    expect((threw as CHRetryExhaustedError).code).toBe("CH_RETRY_EXHAUSTED");
  });

  test("sleep sequence between attempts follows backoff schedule", async () => {
    const sleeps: number[] = [];
    const fn = async () => {
      throw Object.assign(new Error("503"), { status_code: 503 });
    };
    const cfg: RetryInsertConfig = { ...defaultRetryInsertConfig, maxAttempts: 5, jitter: 0 };
    const wrapped = withRetryInsert(fn, cfg, {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0.5,
      logger: silentLogger,
    });
    await wrapped([{ a: 1 }]).catch(() => {});
    // 5 attempts → 4 sleeps: 250, 500, 1000, 2000.
    expect(sleeps).toEqual([250, 500, 1000, 2000]);
  });

  test("preserves single-writer pattern — retries are sequential", async () => {
    // Verify: during a retry, no second call starts until the first
    // settles. The test injects a resolver-gated insertFn and checks
    // that calls never overlap.
    let active = 0;
    let maxActive = 0;
    let calls = 0;
    const fn = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        await new Promise((r) => setTimeout(r, 1));
        calls++;
        if (calls < 3) {
          throw Object.assign(new Error("503"), { status_code: 503 });
        }
        return { ok: true };
      } finally {
        active--;
      }
    };
    const wrapped = withRetryInsert(
      fn,
      { ...defaultRetryInsertConfig, jitter: 0 },
      {
        sleep: async () => {},
        random: () => 0.5,
        logger: silentLogger,
      },
    );
    await wrapped([{ a: 1 }]);
    expect(maxActive).toBe(1);
  });
});
