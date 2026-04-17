import { beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { Event } from "@bematist/schema";
import { createLuaRateLimiter, type LuaRedis, permissiveRateLimiter } from "./auth/rateLimit";
import type { IngestKeyRow, IngestKeyStore } from "./auth/verifyIngestKey";
import { LRUCache } from "./auth/verifyIngestKey";
import { resetDeps, setDeps } from "./deps";
import { handle } from "./server";

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

// An in-memory ingest_keys store that supports both 2-seg (legacy) and 3-seg
// bearer lookups. Seeded in beforeAll with a row for Bearer dm_test_abc.
function makeStore(rows: IngestKeyRow[]): IngestKeyStore {
  const byKey = new Map<string, IngestKeyRow>();
  const byOrg = new Map<string, IngestKeyRow>();
  for (const r of rows) {
    byKey.set(`${r.org_id}/${r.id}`, r);
    byOrg.set(r.org_id, r);
  }
  return {
    async get(orgId, keyId) {
      if (keyId === "*") return byOrg.get(orgId) ?? null;
      return byKey.get(`${orgId}/${keyId}`) ?? null;
    },
  };
}

beforeAll(() => {
  // Seed a legacy 2-seg key: dm_test_abc (orgId=test, secret=abc).
  const row: IngestKeyRow = {
    id: "legacy_test_key",
    org_id: "test",
    engineer_id: "eng_test",
    key_sha256: hashSecret("abc"),
    tier_default: "B",
    revoked_at: null,
  };
  setDeps({
    store: makeStore([row]),
    cache: new LRUCache({ max: 1000, ttlMs: 60_000 }),
    rateLimiter: permissiveRateLimiter(),
  });
});

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    client_event_id: crypto.randomUUID(),
    schema_version: 1,
    ts: "2026-04-16T12:00:00.000Z",
    tenant_id: "org_abc",
    engineer_id: "eng_hash_xyz",
    device_id: "device_1",
    source: "claude-code",
    fidelity: "full",
    cost_estimated: false,
    tier: "B",
    session_id: "sess_1",
    event_seq: 0,
    dev_metrics: { event_kind: "llm_request" },
    ...overrides,
  };
}

function postEvents(
  body: unknown,
  auth: string | null = "Bearer dm_test_abc",
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...extraHeaders,
  };
  if (auth) headers.authorization = auth;
  return handle(
    new Request("http://localhost/v1/events", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("ingest server", () => {
  test("GET /healthz returns 200 ok", async () => {
    const res = await handle(new Request("http://localhost/healthz"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("GET /v1/events returns 405 (wrong method)", async () => {
    const res = await handle(new Request("http://localhost/v1/events"));
    expect(res.status).toBe(405);
  });

  test("unknown route returns 404", async () => {
    const res = await handle(new Request("http://localhost/nope"));
    expect(res.status).toBe(404);
  });

  test("POST /v1/events without Authorization returns 401", async () => {
    const res = await handle(
      new Request("http://localhost/v1/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: [makeEvent()] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("POST /v1/events with malformed Authorization returns 401", async () => {
    const res = await postEvents({ events: [makeEvent()] }, "Basic xxx");
    expect(res.status).toBe(401);
  });

  test("POST /v1/events with valid Bearer + valid event → 202 { accepted: 1 }", async () => {
    const res = await postEvents({ events: [makeEvent()] });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { accepted: number; deduped: number; request_id: string };
    expect(body.accepted).toBe(1);
    expect(body.deduped).toBe(0);
    expect(typeof body.request_id).toBe("string");
    expect(body.request_id.length).toBeGreaterThan(0);
  });

  test("POST /v1/events with malformed event (missing client_event_id) → 400", async () => {
    const { client_event_id: _omit, ...ev } = makeEvent();
    const res = await postEvents({ events: [ev] });
    // All-invalid batch → 400 per contract 02 §Response codes.
    expect(res.status).toBe(400);
  });

  test("POST /v1/events with partial-invalid batch → 207", async () => {
    const good = makeEvent();
    const { client_event_id: _omit, ...bad } = makeEvent();
    const res = await postEvents({ events: [good, bad] });
    expect(res.status).toBe(207);
    const body = (await res.json()) as { accepted: number; rejected: unknown[] };
    expect(body.accepted).toBe(1);
    expect(body.rejected.length).toBe(1);
  });

  test("POST /v1/events with invalid JSON → 400", async () => {
    const res = await postEvents("{not json", "Bearer dm_test_abc");
    expect(res.status).toBe(400);
  });

  test("POST /v1/events without events array → 400", async () => {
    const res = await postEvents({ foo: "bar" });
    expect(res.status).toBe(400);
  });

  test("POST /v1/events with >1000 events → 413", async () => {
    const events = Array.from({ length: 1001 }, () => makeEvent());
    const res = await postEvents({ events });
    expect(res.status).toBe(413);
  });

  // --- Phase 1 additions --------------------------------------------------

  test("POST /v1/events with unknown orgId (store miss) → 401", async () => {
    const res = await postEvents({ events: [makeEvent()] }, "Bearer dm_unknownorg_abc");
    expect(res.status).toBe(401);
  });

  test("POST /v1/events with revoked key → 401", async () => {
    // Scope-local override of deps for this test only.
    const row: IngestKeyRow = {
      id: "revoked",
      org_id: "revokedorg",
      engineer_id: "eng",
      key_sha256: hashSecret("abc"),
      tier_default: "B",
      revoked_at: new Date("2026-01-01T00:00:00Z"),
    };
    setDeps({
      store: makeStore([row]),
      cache: new LRUCache({ max: 1000, ttlMs: 60_000 }),
    });
    const res = await postEvents({ events: [makeEvent()] }, "Bearer dm_revokedorg_abc");
    expect(res.status).toBe(401);
    // restore baseline
    resetDeps();
    beforeAllReseed();
  });

  test("POST /v1/events with correct key but wrong secret (hash mismatch) → 401", async () => {
    const row: IngestKeyRow = {
      id: "k1",
      org_id: "mismatchorg",
      engineer_id: "eng",
      key_sha256: hashSecret("correct-secret"),
      tier_default: "B",
      revoked_at: null,
    };
    setDeps({
      store: makeStore([row]),
      cache: new LRUCache({ max: 1000, ttlMs: 60_000 }),
    });
    const res = await postEvents({ events: [makeEvent()] }, "Bearer dm_mismatchorg_WRONG");
    expect(res.status).toBe(401);
    resetDeps();
    beforeAllReseed();
  });

  test("POST /v1/events with LRU cache hit → store queried once across two calls", async () => {
    let storeCalls = 0;
    const row: IngestKeyRow = {
      id: "cachekey",
      org_id: "cacheorg",
      engineer_id: "eng",
      key_sha256: hashSecret("abc"),
      tier_default: "B",
      revoked_at: null,
    };
    const store: IngestKeyStore = {
      async get(orgId, keyId) {
        storeCalls++;
        if (orgId === "cacheorg" && (keyId === "*" || keyId === "cachekey")) return row;
        return null;
      },
    };
    setDeps({
      store,
      cache: new LRUCache({ max: 1000, ttlMs: 60_000 }),
    });
    await postEvents({ events: [makeEvent()] }, "Bearer dm_cacheorg_abc");
    await postEvents({ events: [makeEvent()] }, "Bearer dm_cacheorg_abc");
    expect(storeCalls).toBe(1);
    resetDeps();
    beforeAllReseed();
  });

  test("POST /v1/events with rate-limit exhausted → 429 with Retry-After", async () => {
    const t = 1_000_000;
    const fakeRedis = makeFakeLuaRedis({ nowMs: () => t });
    const limiter = createLuaRateLimiter(fakeRedis, 2, 1); // capacity 2, refill 1 tok/s
    setDeps({ rateLimiter: limiter });
    const ok1 = await postEvents({ events: [makeEvent()] });
    expect(ok1.status).toBe(202);
    const ok2 = await postEvents({ events: [makeEvent()] });
    expect(ok2.status).toBe(202);
    const denied = await postEvents({ events: [makeEvent()] });
    expect(denied.status).toBe(429);
    const retryAfter = denied.headers.get("retry-after");
    expect(retryAfter).not.toBeNull();
    expect(Number.parseInt(retryAfter ?? "0", 10)).toBeGreaterThan(0);
    resetDeps();
    beforeAllReseed();
  });

  test("POST /v1/events with 100 successive allowed calls at cost=1 all 202", async () => {
    const fakeRedis = makeFakeLuaRedis();
    const limiter = createLuaRateLimiter(fakeRedis, 1000, 1000);
    setDeps({ rateLimiter: limiter });
    for (let i = 0; i < 100; i++) {
      const r = await postEvents({ events: [makeEvent()] });
      expect(r.status).toBe(202);
    }
    resetDeps();
    beforeAllReseed();
  });
});

// -------- helpers ----------------------------------------------------------

function beforeAllReseed(): void {
  const row: IngestKeyRow = {
    id: "legacy_test_key",
    org_id: "test",
    engineer_id: "eng_test",
    key_sha256: hashSecret("abc"),
    tier_default: "B",
    revoked_at: null,
  };
  setDeps({
    store: makeStore([row]),
    cache: new LRUCache({ max: 1000, ttlMs: 60_000 }),
    rateLimiter: permissiveRateLimiter(),
  });
}

interface FakeBucket {
  tokens: number;
  ts: number;
}

function makeFakeLuaRedis(opts: { nowMs?: () => number } = {}): LuaRedis {
  const nowMs = opts.nowMs ?? (() => Date.now());
  const buckets = new Map<string, FakeBucket>();
  function runBucket(
    keys: (string | number)[],
    args: (string | number)[],
  ): [number, number, number] {
    const key = String(keys[0]);
    const cap = Number(args[0]);
    const rate = Number(args[1]);
    const cost = Number(args[2]);
    const now = nowMs();
    const existing = buckets.get(key);
    let tok = existing?.tokens ?? cap;
    const ts = existing?.ts ?? now;
    tok = Math.min(cap, tok + ((now - ts) * rate) / 1000);
    if (tok < cost) {
      buckets.set(key, { tokens: tok, ts: now });
      return [0, Math.floor(tok), Math.ceil(((cost - tok) * 1000) / rate)];
    }
    tok = tok - cost;
    buckets.set(key, { tokens: tok, ts: now });
    return [1, Math.floor(tok), 0];
  }
  return {
    async scriptLoad() {
      return "sha-test";
    },
    async evalsha(_sha, keys, args) {
      return runBucket(keys, args);
    },
    async eval(_src, keys, args) {
      return runBucket(keys, args);
    },
  };
}
