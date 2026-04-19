// Main daemon loop.
//
// Responsibilities:
//   1. Build adapter registry, init each adapter. Skip-if-absent is handled
//      inside each adapter's discovery layer; init still runs, but poll() is
//      a no-op when the underlying source (e.g. ~/.claude/projects/) doesn't
//      exist. See apps/collector/src/adapters/*/discovery.ts.
//   2. Every pollIntervalMs: call runOnce() across every adapter, enqueue
//      any emitted events into the SQLite Journal.
//   3. Every flushIntervalMs: select a batch from Journal, write the batch
//      descriptor to the append-only egress log (Bill of Rights #1), POST
//      the events to the ingest via postWithRetry, update Journal rows.
//   4. On SIGINT/SIGTERM: stop the loop, wait for in-flight poll + flush to
//      finish, persist cursor state, close DB.
//
// Tested in loop.test.ts.

import type { Database } from "bun:sqlite";
import type { Event } from "@bematist/schema";
import type { Adapter } from "@bematist/sdk";
import { buildRegistry } from "./adapters";
// ───────────────────────────────────────────────────────────────────────────
// Streaming refactor (2026-04-19): previously this loop ran poll and flush
// in a single serialized while-loop. A long first-poll backfill (walid hit
// ~4,975 JSONL files) blocked flush for ~20 minutes — cursors advanced
// per-file but events were held in one in-memory array until poll returned.
// The loop now runs `pollLoop` and `flushLoop` as independent async tasks.
// Adapters emit events via a callback wired to `journal.enqueue`, so events
// land in SQLite per-file and flush drains whatever's already queued — no
// "bubbling." See orchestrator/index.ts rationale.
// ───────────────────────────────────────────────────────────────────────────
import type { CollectorConfig } from "./config";
import { SqliteCursorStore } from "./cursor/store";
import type { EgressLog } from "./egress/egressLog";
import { flushBatch } from "./egress/flush";
import type { Journal } from "./egress/journal";
import { log } from "./logger";
import { runOnce } from "./orchestrator";

export interface LoopDeps {
  db: Database;
  journal: Journal;
  egressLog: EgressLog;
  config: CollectorConfig;
  /** Optional injected fetch for tests. */
  fetchImpl?: typeof fetch;
  /** Optional injected registry for tests; defaults to buildRegistry. */
  registry?: Adapter[];
  /** Optional sleep injection — tests skip real timers. */
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface LoopHandle {
  /** Trigger graceful shutdown; resolves once the loop has stopped. */
  stop(): Promise<void>;
  /** Promise that resolves when the loop has fully stopped (for tests / top-level await). */
  done: Promise<void>;
  /** Current active-adapter list. */
  adapters: Adapter[];
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function mkAdapterLogger() {
  const noop = () => {};
  const l = {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child() {
      return l;
    },
  };
  return l;
}

function mkAdapterContext(config: CollectorConfig, db: Database, a: Adapter) {
  return {
    dataDir: config.dataDir,
    policy: {
      enabled: true,
      tier: config.tier,
      pollIntervalMs: config.pollIntervalMs,
    },
    log: mkAdapterLogger(),
    tier: config.tier,
    cursor: new SqliteCursorStore(db, a.id),
  };
}

/**
 * Start the daemon loop. Returns a handle; the loop runs until `handle.stop()`
 * is called or the abort signal fires.
 */
export function startLoop(deps: LoopDeps): LoopHandle {
  const { db, journal, egressLog, config } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleepImpl = deps.sleepImpl ?? defaultSleep;

  const registry =
    deps.registry ??
    buildRegistry({
      tenantId: config.tenantId,
      engineerId: config.engineerId,
      deviceId: config.deviceId,
    });

  const ac = new AbortController();
  let stopped = false;
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((r) => {
    resolveDone = r;
  });

  // Shared halt signal — set when a fatal flush result tells us to give up.
  let fatalHalt = false;

  // Streaming emit — wired to the journal. Every adapter event lands in
  // SQLite per-emit, so the flush loop (running independently) can drain
  // whatever's already durable without waiting for poll to finish.
  const emit = (event: Event) => {
    try {
      journal.enqueue(event);
    } catch (e) {
      log.warn({ err: String(e) }, "journal.enqueue failed (event dropped)");
    }
  };

  const pollLoop = async () => {
    while (!ac.signal.aborted && !fatalHalt) {
      try {
        await runOnce(
          registry,
          (a) => mkAdapterContext(config, db, a),
          {
            concurrency: config.adapterConcurrency,
            perPollTimeoutMs: config.perPollTimeoutMs,
          },
          emit,
        );
      } catch (e) {
        log.warn({ err: String(e) }, "orchestrator poll cycle failed");
      }
      if (ac.signal.aborted || fatalHalt) break;
      await sleepImpl(config.pollIntervalMs);
    }
  };

  const flushLoop = async () => {
    while (!ac.signal.aborted && !fatalHalt) {
      let delayMs = config.flushIntervalMs;
      try {
        const result = await flushBatch(journal, egressLog, {
          endpoint: config.endpoint,
          token: config.token,
          fetchImpl,
          dryRun: config.dryRun,
          batchSize: config.batchSize,
          ingestOnlyTo: config.ingestOnlyTo,
          signal: ac.signal,
        });
        if (result.fatal) {
          log.fatal({ reason: result.note }, "egress fatal — halting loop");
          fatalHalt = true;
          ac.abort();
          break;
        }
        if (result.retryAfterSeconds) {
          delayMs = Math.max(config.flushIntervalMs, result.retryAfterSeconds * 1000);
        }
      } catch (e) {
        log.warn({ err: String(e) }, "flush cycle failed");
      }
      if (ac.signal.aborted || fatalHalt) break;
      await sleepImpl(delayMs);
    }
  };

  const run = async () => {
    // Init adapters. Adapter-level failures are non-fatal: log + skip.
    for (const a of registry) {
      try {
        await a.init(mkAdapterContext(config, db, a));
      } catch (e) {
        log.warn({ adapter: a.id, err: String(e) }, "adapter init failed");
      }
    }

    // Run poll and flush as independent async loops — neither blocks the
    // other. Poll emits per-file, flush drains in parallel.
    await Promise.all([pollLoop(), flushLoop()]);

    // Shutdown: one last flush pass so we don't leave in-flight-but-unpushed rows.
    if (!fatalHalt) {
      try {
        await flushBatch(journal, egressLog, {
          endpoint: config.endpoint,
          token: config.token,
          fetchImpl,
          dryRun: config.dryRun,
          batchSize: config.batchSize,
          ingestOnlyTo: config.ingestOnlyTo,
        });
      } catch (e) {
        log.warn({ err: String(e) }, "shutdown flush failed");
      }
    }

    for (const a of registry) {
      try {
        await a.shutdown?.(mkAdapterContext(config, db, a));
      } catch {}
    }
    resolveDone();
  };

  // Kick the loop; don't await here — return the handle.
  run().catch((e) => {
    log.error({ err: String(e) }, "loop crashed");
    resolveDone();
  });

  return {
    adapters: registry,
    done,
    async stop() {
      if (stopped) return done;
      stopped = true;
      ac.abort();
      return done;
    },
  };
}
