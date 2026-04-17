// Module-level dependency injection seam for the ingest server.
// Sprint 1 default: an empty in-memory store that rejects every bearer
// (safe-fail), plus a permissive rate limiter. Production boot in
// index.ts swaps these for real Postgres / Redis backed implementations.
// Tests call setDeps({store, rateLimiter, cache}) in beforeAll to stub.

import { permissiveRateLimiter, type RateLimiter } from "./auth/rateLimit";
import type { IngestKeyStore } from "./auth/verifyIngestKey";
import { LRUCache } from "./auth/verifyIngestKey";

export interface Deps {
  store: IngestKeyStore;
  rateLimiter: RateLimiter;
  cache: LRUCache;
  clock: () => number;
}

function makeDefaultDeps(): Deps {
  const emptyStore: IngestKeyStore = {
    async get() {
      return null;
    },
  };
  return {
    store: emptyStore,
    rateLimiter: permissiveRateLimiter(),
    cache: new LRUCache({ max: 1000, ttlMs: 60_000 }),
    clock: () => Date.now(),
  };
}

// Intentionally mutable: swapped by setDeps() in tests and boot wiring.
let _deps: Deps = makeDefaultDeps();

export function getDeps(): Deps {
  return _deps;
}

export function setDeps(patch: Partial<Deps>): void {
  _deps = { ..._deps, ...patch };
}

export function resetDeps(): void {
  _deps = makeDefaultDeps();
}
