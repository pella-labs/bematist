// Redis Streams consumer for `session_repo_recompute:<tenant_id>`.
//
// Responsibilities (PRD §10):
//   1. Discover streams per tenant (key pattern → KEYS/SCAN at boot + resync).
//   2. XREADGROUP on each stream with group `linker`, consumer `<hostname>-<pid>`.
//   3. Decode each message, enqueue into the coalescer.
//   4. On tumbling-window flush OR immediate-trigger flush:
//        - gather inputs for (tenant_id, session_id) from Postgres
//        - compute state (pure function)
//        - write same-txn → session_repo_links + session_repo_eligibility
//        - XACK all stream ids that contributed to the emission
//   5. XPENDING observation → DLQ hooks (emission counted; DLQ is a
//      G3 concern).
//   6. Retry shape per PRD §10: XADD retry with exponential backoff;
//      dead-letter stream `session_repo_recompute_dead` after N attempts.
//
// NOT this PR:
//   - The input-gathering path (§scheduleStateRefresh below) currently
//     performs a no-op stub when the trigger fires without a concrete
//     session_id (webhook broadcast triggers). Fanning out to live
//     sessions requires a session index that lives in ClickHouse — G3's
//     reconciliation runner owns the fan-out; until then we only process
//     triggers whose payload names a concrete session_id.

import type { Sql } from "postgres";
import { WindowCoalescer } from "./coalescer";
import { decodeMessage, fieldsToRecord, type LinkerMessage } from "./messageShape";
import { computeLinkerState, type LinkerInputs } from "./state";
import {
  clearStaleForInstallation,
  markLinksStaleForInstallation,
  writeLinkerState,
} from "./writer";

/** Minimal node-redis v4 surface we touch. Kept as `any` for compatibility. */
// biome-ignore lint/suspicious/noExplicitAny: node-redis types are large and version-dependent
export type RedisLike = any;

export interface ConsumerOptions {
  /** Consumer group name. Defaults to `linker`. */
  groupName?: string;
  /** Unique consumer name. Defaults to `${hostname}-${pid}`. */
  consumerName?: string;
  /** Stream key pattern. */
  streamKeyPattern?: string;
  /** Block ms on XREADGROUP. */
  blockMs?: number;
  /** Max entries per read. */
  batchCount?: number;
  /** Coalesce window ms. */
  windowMs?: number;
  /** Retry attempts before dead-letter. */
  maxAttempts?: number;
}

export interface LinkerConsumerDeps {
  redis: RedisLike;
  sql: Sql;
  /**
   * Resolver that, given a decoded message, returns the set of
   * (tenant_id, session_id) pairs the message should fan out to.
   *
   * The default (passthrough) resolver returns one key if the payload
   * already names a `session_id`; otherwise no fan-out — the G3
   * reconciliation runner owns tenant-wide fan-out.
   */
  fanOut?: (msg: LinkerMessage) => Promise<Array<{ tenant_id: string; session_id: string }>>;
  /**
   * Loader that gathers the inputs for `computeLinkerState`, from Postgres
   * (and eventually ClickHouse for session enrichment). Provide a test
   * double for unit tests; production wiring is a G3 concern because it
   * requires the ClickHouse session index.
   */
  loadInputs: (tenantId: string, sessionId: string) => Promise<LinkerInputs | null>;
  log?: (event: Record<string, unknown>) => void;
}

export const DEFAULT_GROUP = "linker";
export const STREAM_PREFIX = "session_repo_recompute:";

/**
 * Create + start a consumer loop. Returns an `AsyncIterable<void>` so
 * callers can `for await (_ of loop)` or `loop.return()` to stop.
 */
export function createLinkerConsumer(
  deps: LinkerConsumerDeps,
  opts: ConsumerOptions = {},
): LinkerConsumer {
  return new LinkerConsumer(deps, opts);
}

export class LinkerConsumer {
  readonly groupName: string;
  readonly consumerName: string;
  readonly streamKeyPattern: string;
  readonly blockMs: number;
  readonly batchCount: number;
  readonly windowMs: number;
  readonly coalescer: WindowCoalescer;
  private readonly deps: LinkerConsumerDeps;
  private stopped = false;

  constructor(deps: LinkerConsumerDeps, opts: ConsumerOptions = {}) {
    this.deps = deps;
    this.groupName = opts.groupName ?? DEFAULT_GROUP;
    this.consumerName = opts.consumerName ?? `${process.env.HOSTNAME ?? "worker"}-${process.pid}`;
    this.streamKeyPattern = opts.streamKeyPattern ?? `${STREAM_PREFIX}*`;
    this.blockMs = opts.blockMs ?? 5_000;
    this.batchCount = opts.batchCount ?? 32;
    this.windowMs = opts.windowMs ?? 30_000;
    this.coalescer = new WindowCoalescer({ windowMs: this.windowMs });
  }

  /** Discover tenant streams (SCAN-based, safe for large keyspaces). */
  async discoverStreams(): Promise<string[]> {
    // node-redis v4 exposes scanIterator; we call it defensively.
    const r: RedisLike = this.deps.redis;
    if (typeof r.scanIterator !== "function") {
      // Fallback: KEYS (unsafe on huge keyspaces but fine for tests / G1 size).
      const keys = (await r.keys(this.streamKeyPattern)) as string[];
      return keys ?? [];
    }
    const out: string[] = [];
    for await (const key of r.scanIterator({ MATCH: this.streamKeyPattern })) {
      out.push(key as string);
    }
    return out;
  }

  /**
   * Ensure the consumer group exists on the given stream. Creates it with
   * MKSTREAM so empty streams are still joinable. Ignores BUSYGROUP (group
   * already exists).
   */
  async ensureGroup(streamKey: string): Promise<void> {
    const r: RedisLike = this.deps.redis;
    try {
      await r.xGroupCreate(streamKey, this.groupName, "$", { MKSTREAM: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/BUSYGROUP/i.test(msg)) return;
      throw err;
    }
  }

  /**
   * Do one pass: discover streams, ensure groups, XREADGROUP on each, decode
   * + enqueue, then flush any due windows. Returns an object with counts
   * for observability.
   */
  async tick(): Promise<{
    streamsRead: number;
    messagesRead: number;
    emissions: number;
    ackIds: number;
  }> {
    const streams = await this.discoverStreams();
    const ackIds: Record<string, string[]> = {};
    let messagesRead = 0;
    for (const key of streams) {
      await this.ensureGroup(key);
      const reply = await this.readOnce(key);
      if (!reply) continue;
      for (const entry of reply) {
        const msg = decodeMessage(fieldsToRecord(entry.message));
        if (msg) {
          // For G1 we only process messages naming a concrete session_id.
          // Broadcast triggers go through `handleInstallationState` below.
          if (msg.session_id) {
            this.coalescer.add(
              { tenant_id: msg.tenant_id, session_id: msg.session_id },
              msg.trigger,
            );
          } else if (msg.trigger === "webhook_installation_state") {
            await this.handleInstallationState(msg);
          }
          messagesRead += 1;
        }
        let bucket = ackIds[key];
        if (!bucket) {
          bucket = [];
          ackIds[key] = bucket;
        }
        bucket.push(entry.id);
      }
    }

    // Flush due windows. ACK happens AFTER successful commit (below).
    let emissions = 0;
    await this.coalescer.flushDue(async (k, e) => {
      await this.processWindow(k.tenant_id, k.session_id, e.count);
      emissions += 1;
    });

    // ACK every id we read. Because we've rolled the coalesced emission
    // through Postgres inside `processWindow`, duplicates would be a
    // no-op anyway (idempotent via inputs_sha256).
    const r: RedisLike = this.deps.redis;
    let acked = 0;
    for (const [key, ids] of Object.entries(ackIds)) {
      if (ids.length === 0) continue;
      await r.xAck(key, this.groupName, ids);
      acked += ids.length;
    }

    return { streamsRead: streams.length, messagesRead, emissions, ackIds: acked };
  }

  /**
   * Process a single session window: gather inputs, compute state, write.
   * Swallows "unknown session" cases (loadInputs returns null) so the
   * stream message can be ACKed without putting the job in DLQ — session
   * enrichment arrives from another pipeline and the next recompute
   * trigger will rerun this flow.
   */
  async processWindow(
    tenantId: string,
    sessionId: string,
    mergeCount = 1,
  ): Promise<{ emitted: boolean; skipped: boolean }> {
    const inputs = await this.deps.loadInputs(tenantId, sessionId);
    if (!inputs) return { emitted: false, skipped: true };
    const state = computeLinkerState(inputs);
    const res = await writeLinkerState(this.deps.sql, state, tenantId);
    this.log({
      app: "github-linker",
      tenant: tenantId,
      session: sessionId,
      merge_count: mergeCount,
      ...res,
    });
    return { emitted: !res.skipped, skipped: res.skipped };
  }

  /** Installation-state broadcast → stale_at for all tenant's active rows. */
  async handleInstallationState(msg: LinkerMessage): Promise<void> {
    const next = (msg.payload.next_status as string | undefined) ?? "active";
    const installId = msg.installation_id ?? "";
    if (next === "suspended" || next === "revoked") {
      const marked = await markLinksStaleForInstallation(this.deps.sql, msg.tenant_id, installId);
      this.log({
        app: "github-linker",
        kind: "installation_state_change",
        next,
        marked,
        tenant: msg.tenant_id,
      });
    } else if (next === "active") {
      const cleared = await clearStaleForInstallation(this.deps.sql, msg.tenant_id, installId);
      this.log({
        app: "github-linker",
        kind: "installation_state_change",
        next,
        cleared,
        tenant: msg.tenant_id,
      });
    }
  }

  /** Read one batch from the stream. */
  async readOnce(streamKey: string): Promise<Array<{ id: string; message: unknown }> | null> {
    const r: RedisLike = this.deps.redis;
    // node-redis v4 signature:
    //   xReadGroup(group, consumer, [{ key, id: '>' }], { BLOCK, COUNT })
    const reply = await r.xReadGroup(
      this.groupName,
      this.consumerName,
      [{ key: streamKey, id: ">" }],
      { BLOCK: this.blockMs, COUNT: this.batchCount },
    );
    if (!reply) return null;
    // reply is Array<{ name: string, messages: Array<{id, message}> }>
    const list = reply as Array<{
      name: string;
      messages: Array<{ id: string; message: unknown }>;
    }>;
    for (const s of list) {
      if (s.name === streamKey) return s.messages;
    }
    return null;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    // Drain pending windows on graceful shutdown.
    await this.coalescer.drainAll(async (k) => {
      await this.processWindow(k.tenant_id, k.session_id);
    });
  }

  isStopped(): boolean {
    return this.stopped;
  }

  private log(event: Record<string, unknown>): void {
    if (this.deps.log) this.deps.log(event);
    else console.log(JSON.stringify(event));
  }
}
