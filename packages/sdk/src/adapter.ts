import type { Event } from "@bematist/schema";

// Source of truth: contracts/03-adapter-sdk.md. Shapes copied verbatim.
// Any discrepancy with the contract is a bug — fix the contract first.

export interface AdapterContext {
  /** Per-machine writable dir, ~/.bematist/adapters/<id>/ */
  dataDir: string;
  /** Resolved policy for this adapter (tier, redaction overrides). */
  policy: AdapterPolicy;
  /** Logger; pino-compatible. */
  log: Logger;
  /** Current effective tier for THIS adapter (may differ from collector default). */
  tier: "A" | "B" | "C";
  /** Stable cursor store: per-source resumable read offsets. */
  cursor: CursorStore;
}

export interface AdapterPolicy {
  enabled: boolean;
  tier: "A" | "B" | "C";
  pollIntervalMs: number;
  redactionOverrides?: Record<string, "drop" | "hash" | "keep">;
}

export interface CursorStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface AdapterHealth {
  status: "ok" | "degraded" | "error" | "disabled";
  lastEventAt?: Date;
  lastErrorAt?: Date;
  lastError?: string;
  /** Honest data-fidelity tag — surfaces in dashboard pickers. */
  fidelity: "full" | "estimated" | "aggregate-only" | "post-migration";
  /** Per-source caveats, e.g. "Cursor Auto-mode → cost_estimated=true". */
  caveats?: string[];
}

/**
 * Alias for AdapterHealth — the B-seed task spec calls this "AdapterStatus".
 * The contract (03-adapter-sdk.md) names it AdapterHealth; both names point
 * at the same shape. Prefer AdapterHealth in new code.
 */
export type AdapterStatus = AdapterHealth;

export interface Adapter {
  /** Unique stable id, e.g. "claude-code", "cursor", "continue". */
  readonly id: string;
  /** Human label for UI. */
  readonly label: string;
  /** Semver of the adapter implementation, NOT the source app. */
  readonly version: string;
  /** Source app version range this adapter knows how to read. */
  readonly supportedSourceVersions: string;

  /** One-time setup. Validate paths, create cursors, etc. Throw to disable. */
  init(ctx: AdapterContext): Promise<void>;

  /** Called every `pollIntervalMs`. Returns events to enqueue.
   *  MUST be cancellation-safe: if the collector aborts mid-poll, no partial state. */
  poll(ctx: AdapterContext, signal: AbortSignal): Promise<Event[]>;

  /** Cheap health check — populates `bematist status` and dashboard. */
  health(ctx: AdapterContext): Promise<AdapterHealth>;

  /** Optional — graceful shutdown hook. */
  shutdown?(ctx: AdapterContext): Promise<void>;
}

// Minimal pino-compatible surface; packages/sdk stays free of a pino dep
// so @bematist/sdk can be consumed by both the collector and tests without
// pulling a logger runtime.
export interface Logger {
  trace(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  fatal(msg: string, ...args: unknown[]): void;
  child(bindings: Record<string, unknown>): Logger;
}
