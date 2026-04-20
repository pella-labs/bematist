// Real ClickHouseWriter backed by @clickhouse/client (Sprint-1 follow-up A).
//
// This replaces the "lazy importer" path in createLazyClickHouseWriter for
// runtime boot — we now know @clickhouse/client is installed (pinned in
// apps/ingest/package.json) so we can eagerly `createClient`. The lazy
// variant stays in clickhouse.ts for tests and for backwards compat with the
// `CLICKHOUSE_WRITER=client` flag path.
//
// The interface matches ClickHouseWriter exactly. `ping()` reuses the small
// HTTP helper from lib/http — we don't call client.ping() because the
// @clickhouse/client one applies its own request-timeout semantics that
// conflict with the /readyz 2s budget.
//
// Bug #8 fix: the raw `client.insert` call is wrapped in `withRetryInsert`
// so transient CH 5xx / network errors retry with capped exponential backoff
// (max 8 attempts, 60s cap) before surfacing to the WAL consumer. 4xx schema
// / auth errors bubble up unretried so the consumer can dead-letter promptly.

import { createClient } from "@clickhouse/client";
import {
  type ClickHouseConfig,
  type ClickHouseWriter,
  defaultClickHouseConfig,
} from "../clickhouse";
import { pingClickHouse as pingClickHouseHttp } from "../lib/http";
import {
  defaultRetryInsertConfig,
  parseRetryConfigFromEnv,
  type RetryDeps,
  type RetryInsertConfig,
  withRetryInsert,
} from "./retryInsert";

// Client-level `date_time_input_format='best_effort'` lets DateTime64 columns
// accept ISO8601 strings (`2026-04-18T01:23:45.678Z`) — the shape EventSchema
// requires on the wire and that canonicalize() in wal/append.ts forwards
// verbatim. Without this, INSERTs raise CANNOT_PARSE_INPUT_ASSERTION_FAILED.
// M2 worked around this in apps/ingest/src/smoke.ts and the web integration
// harness; M3 item 5 promotes the setting to the real writer so every prod
// insert parses both `basic` (ClickHouse default) and ISO8601 inputs.

// Narrow client surface — only what the writer uses. Lets us inject a fake
// in tests without pulling the real @clickhouse/client types.
export interface CHClientLike {
  insert(args: {
    table: string;
    values: Record<string, unknown>[];
    format: "JSONEachRow";
  }): Promise<unknown>;
}

type CHClientFactory = (opts: Record<string, unknown>) => CHClientLike;

const defaultClientFactory: CHClientFactory = (opts) =>
  createClient(opts as Parameters<typeof createClient>[0]) as unknown as CHClientLike;

/**
 * Build the @clickhouse/client options object from a merged ClickHouseConfig.
 * Extracted so the unit test can assert the exact payload handed to the
 * client constructor — in particular, the `clickhouse_settings` field.
 */
export function buildClientOptions(cfg: ClickHouseConfig): Record<string, unknown> {
  return {
    url: cfg.url,
    database: cfg.database,
    keep_alive: { idle_socket_ttl: cfg.keep_alive_idle_socket_ttl_ms },
    request_timeout: cfg.request_timeout_ms,
    compression: {
      request: cfg.compression_request,
      response: cfg.compression_response,
    },
    max_open_connections: cfg.max_open_connections,
    clickhouse_settings: {
      date_time_input_format: "best_effort",
    },
  };
}

export interface CreateRealWriterOpts {
  /**
   * Override the retry config. When absent, reads `CH_WRITER_MAX_RETRIES`
   * from `process.env` and falls back to `defaultRetryInsertConfig`.
   */
  retry?: Partial<RetryInsertConfig>;
  /** Injectable sleep / random / logger for the retry loop (tests). */
  retryDeps?: RetryDeps;
}

export function createRealClickHouseWriter(
  cfg: Partial<ClickHouseConfig> = {},
  clientFactory: CHClientFactory = defaultClientFactory,
  opts: CreateRealWriterOpts = {},
): ClickHouseWriter {
  const merged: ClickHouseConfig = { ...defaultClickHouseConfig, ...cfg };

  const client = clientFactory(buildClientOptions(merged));

  const retryCfg: RetryInsertConfig = {
    ...parseRetryConfigFromEnv(process.env, defaultRetryInsertConfig),
    ...opts.retry,
  };
  const retryingInsert = withRetryInsert(
    (rows) =>
      client.insert({
        table: merged.table,
        values: rows,
        format: "JSONEachRow",
      }),
    retryCfg,
    opts.retryDeps,
  );

  return {
    async insert(rows: Record<string, unknown>[]): Promise<{ ok: true }> {
      await retryingInsert(rows);
      return { ok: true };
    },
    async ping(): Promise<boolean> {
      // Stable 2s timeout over HTTP /ping — decoupled from insert request_timeout.
      return pingClickHouseHttp(merged.url);
    },
  };
}
