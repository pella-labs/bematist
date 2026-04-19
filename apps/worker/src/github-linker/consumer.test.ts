// Integration test — Redis Streams (dev) + Postgres (dev) per docker-compose.dev.yml.
// Skips gracefully when REDIS_URL or DATABASE_URL is unreachable.
//
// Coverage:
//   - discover per-tenant stream, create group, XREADGROUP
//   - decode webhook shape + sync shape
//   - coalesce multiple messages for same (tenant, session) → 1 write
//   - XACK after successful commit
//   - installation-suspend synthetic broadcast → stale_at across tenant's rows

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";
import { createLinkerConsumer, STREAM_PREFIX } from "./consumer";
import { encodeWebhookMessage } from "./messageShape";
import type { LinkerInputs } from "./state";
import { computeLinkerState } from "./state";
import { writeLinkerState } from "./writer";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/bematist";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const SHA = (n: number): string => n.toString(16).padStart(40, "0");
const HASH = (tag: string): Buffer => {
  const b = Buffer.alloc(32);
  Buffer.from(tag).copy(b);
  return b;
};

const sql = postgres(DATABASE_URL, { prepare: false, max: 4, onnotice: () => {} });
let skipDb = false;
let skipRedis = false;
// biome-ignore lint/suspicious/noExplicitAny: node-redis client
let redis: any;
let tenantId: string;
let sessionId: string;

async function canDb(sql: Sql): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  skipDb = !(await canDb(sql));
  try {
    const mod = await import("redis");
    // biome-ignore lint/suspicious/noExplicitAny: runtime type
    const cc = (mod as any).createClient as (o: { url: string }) => any;
    redis = cc({ url: REDIS_URL });
    redis.on("error", () => {});
    await redis.connect();
    await redis.ping();
  } catch {
    skipRedis = true;
  }
});

afterAll(async () => {
  await sql.end();
  try {
    if (redis) await redis.quit();
  } catch {
    // best-effort
  }
});

async function seedTenant(): Promise<string> {
  const rows = (await sql<Array<{ id: string }>>`
    INSERT INTO orgs (name, slug)
    VALUES ('linker-consumer', ${`linker-consumer-${Date.now()}-${Math.random()}`})
    RETURNING id`) as unknown as Array<{ id: string }>;
  return rows[0]!.id;
}
async function cleanupTenant(t: string): Promise<void> {
  await sql.unsafe(`DELETE FROM session_repo_links WHERE tenant_id = $1`, [t]);
  await sql.unsafe(`DELETE FROM session_repo_eligibility WHERE tenant_id = $1`, [t]);
  await sql.unsafe(`DELETE FROM orgs WHERE id = $1`, [t]);
}

function baseInputs(): LinkerInputs {
  return {
    tenant_id: tenantId,
    tenant_mode: "all",
    installations: [{ installation_id: "i1", status: "active" }],
    repos: [{ provider_repo_id: "101", tracking_state: "inherit" }],
    session: {
      session_id: sessionId,
      direct_provider_repo_ids: ["101"],
      commit_shas: [SHA(1)],
      pr_numbers: [],
    },
    pull_requests: [
      {
        provider_repo_id: "101",
        pr_number: 1,
        head_sha: SHA(1),
        merge_commit_sha: null,
        state: "open",
        from_fork: false,
        title_hash: HASH("t"),
        author_login_hash: HASH("a"),
        additions: 0,
        deletions: 0,
        changed_files: 0,
      },
    ],
    deployments: [],
    aliases: [],
    tombstones: [],
  };
}

beforeEach(async () => {
  if (skipDb) return;
  tenantId = await seedTenant();
  sessionId = randomUUID();
});

const suite = skipDb || skipRedis ? describe.skip : describe;
async function preCreateGroup(stream: string): Promise<void> {
  try {
    await redis.xGroupCreate(stream, "linker", "$", { MKSTREAM: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/BUSYGROUP/i.test(msg)) throw err;
  }
}

suite("LinkerConsumer — Redis + Postgres integration", () => {
  test("discovers streams, creates group, XREADGROUP, ACKs after write", async () => {
    const stream = `${STREAM_PREFIX}${tenantId}`;
    await preCreateGroup(stream);
    // Produce a webhook-shape message containing no session_id in payload
    // (typical for webhook events); we use the sync-shape flat message
    // tagged with the session via payload.session_id which our
    // decodeMessage path exposes.
    await redis.xAdd(stream, "*", {
      schema_version: "1",
      tenant_id: tenantId,
      installation_id: "i1",
      trigger: "webhook_pr_upsert",
      session_id: sessionId,
      payload: JSON.stringify({ provider_repo_id: "101" }),
    });

    const consumer = createLinkerConsumer(
      {
        redis,
        sql,
        loadInputs: async (t, s) => (t === tenantId && s === sessionId ? baseInputs() : null),
      },
      { blockMs: 50, windowMs: 0 /* fire immediately for the test */ },
    );

    const out = await consumer.tick();
    expect(out.messagesRead).toBeGreaterThanOrEqual(1);
    expect(out.emissions).toBeGreaterThanOrEqual(1);

    // Row persisted
    const links = await sql<
      Array<{ one: number }>
    >`SELECT 1 as one FROM session_repo_links WHERE tenant_id = ${tenantId}`;
    expect(links.length).toBeGreaterThan(0);

    // Stream fully ACKed
    const pending = await redis.xPending(stream, "linker");
    expect(pending.pending).toBe(0);
    await cleanupTenant(tenantId);
    await redis.del(stream);
  });

  test("coalesces N messages for same (tenant, session) into ONE write", async () => {
    const stream = `${STREAM_PREFIX}${tenantId}`;
    await preCreateGroup(stream);
    for (let i = 0; i < 5; i++) {
      await redis.xAdd(stream, "*", {
        schema_version: "1",
        tenant_id: tenantId,
        installation_id: "i1",
        trigger: "webhook_pr_upsert",
        session_id: sessionId,
        payload: "{}",
      });
    }

    let loadCount = 0;
    const consumer = createLinkerConsumer(
      {
        redis,
        sql,
        loadInputs: async () => {
          loadCount += 1;
          return baseInputs();
        },
      },
      { blockMs: 50, windowMs: 0 },
    );
    const r = await consumer.tick();
    expect(r.messagesRead).toBe(5);
    expect(r.emissions).toBe(1);
    expect(loadCount).toBe(1);
    await cleanupTenant(tenantId);
    await redis.del(stream);
  });

  test("installation-state broadcast → stale_at across tenant rows", async () => {
    // Seed prior live rows
    const state = computeLinkerState(baseInputs());
    await writeLinkerState(sql, state, tenantId);

    const stream = `${STREAM_PREFIX}${tenantId}`;
    await preCreateGroup(stream);
    await redis.xAdd(stream, "*", {
      schema_version: "1",
      tenant_id: tenantId,
      installation_id: "i1",
      trigger: "webhook_installation_state",
      payload: JSON.stringify({ next_status: "suspended", reason: "user_suspend" }),
    });

    const consumer = createLinkerConsumer(
      {
        redis,
        sql,
        loadInputs: async () => null,
      },
      { blockMs: 50, windowMs: 0 },
    );
    await consumer.tick();

    const rows = await sql<Array<{ stale_at: Date | null }>>`
      SELECT stale_at FROM session_repo_links WHERE tenant_id = ${tenantId}`;
    expect(rows.every((r) => r.stale_at !== null)).toBe(true);
    await cleanupTenant(tenantId);
    await redis.del(stream);
  });

  test("unknown session (loadInputs returns null) → ACK without DLQ", async () => {
    const stream = `${STREAM_PREFIX}${tenantId}`;
    await preCreateGroup(stream);
    await redis.xAdd(stream, "*", {
      schema_version: "1",
      tenant_id: tenantId,
      installation_id: "i1",
      trigger: "webhook_pr_upsert",
      session_id: sessionId,
      payload: "{}",
    });
    const consumer = createLinkerConsumer(
      { redis, sql, loadInputs: async () => null },
      { blockMs: 50, windowMs: 0 },
    );
    const r = await consumer.tick();
    expect(r.ackIds).toBeGreaterThanOrEqual(1);
    await cleanupTenant(tenantId);
    await redis.del(stream);
  });

  test("B4a — windowMs=30_000: ids remain in XPENDING until window flushes", async () => {
    const stream = `${STREAM_PREFIX}${tenantId}`;
    await preCreateGroup(stream);
    for (let i = 0; i < 3; i++) {
      await redis.xAdd(stream, "*", {
        schema_version: "1",
        tenant_id: tenantId,
        installation_id: "i1",
        trigger: "webhook_pr_upsert",
        session_id: sessionId,
        payload: "{}",
      });
    }

    let clock = 1_000;
    const consumer = createLinkerConsumer(
      {
        redis,
        sql,
        loadInputs: async () => baseInputs(),
      },
      { blockMs: 50, windowMs: 30_000, now: () => clock },
    );

    // First tick reads all 3 messages; window not yet due → no flush, no ACK.
    const t1 = await consumer.tick();
    expect(t1.messagesRead).toBe(3);
    expect(t1.emissions).toBe(0);
    expect(t1.ackIds).toBe(0);
    const pending1 = await redis.xPending(stream, "linker");
    expect(pending1.pending).toBe(3);

    // Advance clock past windowMs; next tick flushes + ACKs all 3.
    clock += 30_000;
    const t2 = await consumer.tick();
    expect(t2.emissions).toBe(1);
    expect(t2.ackIds).toBe(3);
    const pending2 = await redis.xPending(stream, "linker");
    expect(pending2.pending).toBe(0);

    await cleanupTenant(tenantId);
    await redis.del(stream);
  });

  test("B4a — loadInputs throws: ids stay in XPENDING, no ACK", async () => {
    const stream = `${STREAM_PREFIX}${tenantId}`;
    await preCreateGroup(stream);
    await redis.xAdd(stream, "*", {
      schema_version: "1",
      tenant_id: tenantId,
      installation_id: "i1",
      trigger: "webhook_pr_upsert",
      session_id: sessionId,
      payload: "{}",
    });

    const consumer = createLinkerConsumer(
      {
        redis,
        sql,
        loadInputs: async () => {
          throw new Error("downstream unavailable");
        },
      },
      { blockMs: 50, windowMs: 0 /* fire immediately */ },
    );

    await expect(consumer.tick()).rejects.toThrow("downstream unavailable");

    const pending = await redis.xPending(stream, "linker");
    expect(pending.pending).toBe(1);

    // Retry-pending gauge surfaces the backlog depth.
    const depth = await consumer.retryPendingDepth(stream);
    expect(depth).toBeGreaterThanOrEqual(1);

    await cleanupTenant(tenantId);
    await redis.del(stream);
  });

  test("encodes webhook message via helper → decoder roundtrips", async () => {
    const fields = encodeWebhookMessage({
      schema_version: 1,
      trigger: "webhook_pr_upsert",
      tenant_id: tenantId,
      installation_id: "i1",
      received_at: new Date().toISOString(),
      payload: { provider_repo_id: "101" },
    });
    const stream = `${STREAM_PREFIX}${tenantId}`;
    await preCreateGroup(stream);
    await redis.xAdd(stream, "*", fields);
    const consumer = createLinkerConsumer(
      {
        redis,
        sql,
        // session_id is null on webhook-wrapped shape — expect no emission.
        loadInputs: async () => null,
      },
      { blockMs: 50, windowMs: 0 },
    );
    const r = await consumer.tick();
    expect(r.messagesRead).toBeGreaterThanOrEqual(1);
    expect(r.emissions).toBe(0); // no session_id in payload
    await cleanupTenant(tenantId);
    await redis.del(stream);
  });
});
