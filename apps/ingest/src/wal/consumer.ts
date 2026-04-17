// WAL consumer (Sprint-1 Phase-4, PRD §Phase 4, D-S1-7, D-S1-24).
//
// Reads from Redis Stream `events_wal` via consumer-group semantics
// (`XREADGROUP`), parses `canonical_json` back into rows, inserts into
// ClickHouse, then ACKs the stream entry. On failure, retries with
// exponential backoff up to `maxRetries`; exhausted entries are dead-lettered
// to `events_wal_dead` and ACKed on the primary stream so the pending-entry
// list drains.
//
// The consumer NEVER calls `xadd` on the primary stream (that is the
// appender's job); it only `xadd`s to the dead-letter stream.
//
// Tests drive `drainOnce()` directly to avoid spawning the background loop.

import type { ClickHouseWriter } from "../clickhouse";
import { logger as defaultLogger } from "../logger";
import type { WalRedis } from "./append";

export type WalConsumerConfig = {
  stream: string;
  group: string;
  consumer: string;
  batchMaxRows: number;
  batchMaxAgeMs: number;
  maxRetries: number;
  deadLetterStream: string;
};

export const defaultWalConsumerConfig: WalConsumerConfig = {
  stream: "events_wal",
  group: "ingest-consumer",
  consumer: "c1",
  batchMaxRows: 1000,
  batchMaxAgeMs: 500,
  maxRetries: 5,
  deadLetterStream: "events_wal_dead",
};

export interface WalConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
  drainOnce(): Promise<{ inserted: number; acked: string[]; deadLettered: string[] }>;
  isRunning(): boolean;
  lag(): Promise<number>;
}

interface WalConsumerLogger {
  // biome-ignore lint/suspicious/noExplicitAny: pino-shaped logger accepts any structured payload
  info: (...a: any[]) => void;
  // biome-ignore lint/suspicious/noExplicitAny: pino-shaped logger accepts any structured payload
  warn: (...a: any[]) => void;
  // biome-ignore lint/suspicious/noExplicitAny: pino-shaped logger accepts any structured payload
  error: (...a: any[]) => void;
}

interface WalConsumerDeps {
  redis: WalRedis;
  ch: ClickHouseWriter;
  config?: Partial<WalConsumerConfig>;
  logger?: WalConsumerLogger;
  clock?: () => number;
}

function backoffMs(attempt: number): number {
  // 200ms * 2^attempts, capped at 5s.
  return Math.min(5000, 200 * 2 ** attempt);
}

export function createWalConsumer(deps: WalConsumerDeps): WalConsumer {
  const cfg: WalConsumerConfig = { ...defaultWalConsumerConfig, ...(deps.config ?? {}) };
  const log = deps.logger ?? defaultLogger;
  const redis = deps.redis;
  const ch = deps.ch;

  // Per-id retry count, kept in-memory. Survives only until the process
  // restarts; Redis is the durable source of truth via the pending-entry list.
  const retries = new Map<string, number>();

  let running = false;
  let stopRequested = false;
  let inFlight: Promise<unknown> | null = null;

  async function ensureGroup(): Promise<void> {
    try {
      await redis.xgroupCreate(cfg.stream, cfg.group, "$", { mkstream: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // BUSYGROUP Consumer Group name already exists — idempotent init.
      if (!msg.includes("BUSYGROUP")) {
        throw err;
      }
    }
  }

  async function drainOnce(): Promise<{
    inserted: number;
    acked: string[];
    deadLettered: string[];
  }> {
    const messages = await redis.xreadgroup(cfg.group, cfg.consumer, cfg.stream, ">", {
      count: cfg.batchMaxRows,
      blockMs: cfg.batchMaxAgeMs,
    });
    if (messages.length === 0) {
      return { inserted: 0, acked: [], deadLettered: [] };
    }
    // Parse rows from canonical_json.
    const rows: Record<string, unknown>[] = [];
    const ids: string[] = [];
    for (const m of messages) {
      const raw = m.fields.canonical_json;
      if (typeof raw !== "string") {
        log.warn({ id: m.id }, "wal: message missing canonical_json");
        continue;
      }
      try {
        rows.push(JSON.parse(raw) as Record<string, unknown>);
        ids.push(m.id);
      } catch {
        log.warn({ id: m.id }, "wal: canonical_json parse failed; dead-lettering");
        await redis.xadd(cfg.deadLetterStream, m.fields);
        await redis.xack(cfg.stream, cfg.group, [m.id]);
      }
    }

    if (rows.length === 0) {
      return { inserted: 0, acked: [], deadLettered: [] };
    }

    try {
      await ch.insert(rows);
      await redis.xack(cfg.stream, cfg.group, ids);
      // Clear retry counters for successful ids.
      for (const id of ids) retries.delete(id);
      return { inserted: rows.length, acked: ids, deadLettered: [] };
    } catch (err) {
      // Track retry count per-id; escalate to dead-letter when exhausted.
      const acked: string[] = [];
      const deadLettered: string[] = [];
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const msg = messages[i];
        if (id === undefined || msg === undefined) continue;
        const attempts = (retries.get(id) ?? 0) + 1;
        retries.set(id, attempts);
        if (attempts > cfg.maxRetries) {
          // Dead-letter: append to dead stream, ack original to drain the PEL.
          await redis.xadd(cfg.deadLetterStream, msg.fields);
          await redis.xack(cfg.stream, cfg.group, [id]);
          retries.delete(id);
          acked.push(id);
          deadLettered.push(id);
        }
      }
      log.error(
        { err: err instanceof Error ? err.message : String(err), batch: ids.length },
        "wal: ch.insert failed",
      );
      return { inserted: 0, acked, deadLettered };
    }
  }

  async function loop(): Promise<void> {
    running = true;
    let consecutiveFailures = 0;
    while (!stopRequested) {
      inFlight = drainOnce();
      const result: { inserted: number; acked: string[]; deadLettered: string[] } = await (
        inFlight as Promise<{ inserted: number; acked: string[]; deadLettered: string[] }>
      ).catch((e) => {
        log.error({ err: e instanceof Error ? e.message : String(e) }, "wal: drain threw");
        return { inserted: 0, acked: [] as string[], deadLettered: [] as string[] };
      });
      inFlight = null;
      if (result.inserted === 0 && result.deadLettered.length === 0) {
        consecutiveFailures++;
        const ms = backoffMs(Math.min(consecutiveFailures, 5));
        await new Promise((resolve) => setTimeout(resolve, ms));
      } else {
        consecutiveFailures = 0;
      }
    }
    running = false;
  }

  return {
    async start(): Promise<void> {
      await ensureGroup();
      stopRequested = false;
      void loop();
    },
    async stop(): Promise<void> {
      stopRequested = true;
      // Let the in-flight batch finish.
      if (inFlight) {
        await inFlight.catch(() => {});
      }
      // Wait for the loop to observe the flag (simple spin-wait; acceptable
      // for SIGTERM path).
      while (running) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
    drainOnce,
    isRunning(): boolean {
      return running;
    },
    async lag(): Promise<number> {
      const [len, pending] = await Promise.all([
        redis.xlen(cfg.stream),
        redis.xinfoGroupsPending(cfg.stream, cfg.group),
      ]);
      return Math.max(0, len - pending);
    },
  };
}
