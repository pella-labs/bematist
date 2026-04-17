import { EventSchema } from "@bematist/schema";
import { type AuthContext, verifyBearer } from "./auth";
import { getDeps } from "./deps";
import { logger } from "./logger";

const MAX_EVENTS_PER_REQUEST = 1000;
const READYZ_PING_TIMEOUT_MS = 2000;

function parseListenAddr(raw: string | undefined): { hostname: string; port: number } {
  const fallback = { hostname: "0.0.0.0", port: 8000 };
  if (!raw) return fallback;
  // Supports ":8000", "host:8000", or bare port.
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith(":")) {
    const port = Number.parseInt(trimmed.slice(1), 10);
    return Number.isFinite(port) ? { hostname: "0.0.0.0", port } : fallback;
  }
  if (trimmed.includes(":")) {
    const idx = trimmed.lastIndexOf(":");
    const host = trimmed.slice(0, idx);
    const port = Number.parseInt(trimmed.slice(idx + 1), 10);
    return Number.isFinite(port) ? { hostname: host || "0.0.0.0", port } : fallback;
  }
  const port = Number.parseInt(trimmed, 10);
  return Number.isFinite(port) ? { hostname: "0.0.0.0", port } : fallback;
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// Minimal TCP probe: opens a socket, closes it. Dep-free; CLAUDE.md forbids adding deps
// without justification. Upgraded to real client pings in Sprint 1+.
async function pingTcp(urlStr: string | undefined, defaultPort: number): Promise<boolean> {
  if (!urlStr) return false;
  let host: string;
  let port: number;
  try {
    const u = new URL(urlStr);
    host = u.hostname;
    port = u.port ? Number.parseInt(u.port, 10) : defaultPort;
  } catch {
    return false;
  }
  try {
    await withTimeout(
      Bun.connect({
        hostname: host,
        port,
        socket: {
          open(sock) {
            sock.end();
          },
          data() {},
          close() {},
          error() {},
        },
      }),
      READYZ_PING_TIMEOUT_MS,
    );
    return true;
  } catch {
    return false;
  }
}

async function pingClickHouse(urlStr: string | undefined): Promise<boolean> {
  if (!urlStr) return false;
  try {
    const res = await withTimeout(
      fetch(new URL("/ping", urlStr).toString(), { method: "GET" }),
      READYZ_PING_TIMEOUT_MS,
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function readinessChecks(): Promise<{
  postgres: boolean;
  clickhouse: boolean;
  redis: boolean;
}> {
  const [postgres, clickhouse, redis] = await Promise.all([
    pingTcp(process.env.DATABASE_URL, 5432),
    pingClickHouse(process.env.CLICKHOUSE_URL),
    pingTcp(process.env.REDIS_URL, 6379),
  ]);
  return { postgres, clickhouse, redis };
}

async function handleEvents(req: Request, auth: AuthContext, requestId: string): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(
      { error: "invalid json", code: "BAD_JSON", request_id: requestId },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || !Array.isArray((body as { events?: unknown }).events)) {
    return json(
      { error: "missing events array", code: "BAD_SHAPE", request_id: requestId },
      { status: 400 },
    );
  }

  const events = (body as { events: unknown[] }).events;
  if (events.length > MAX_EVENTS_PER_REQUEST) {
    return json(
      { error: `max ${MAX_EVENTS_PER_REQUEST} events per request`, request_id: requestId },
      { status: 413 },
    );
  }

  const rejected: Array<{ index: number; reason: string }> = [];
  for (let i = 0; i < events.length; i++) {
    const result = EventSchema.safeParse(events[i]);
    if (!result.success) {
      rejected.push({ index: i, reason: result.error.issues.map((x) => x.message).join("; ") });
    }
  }

  if (rejected.length > 0 && rejected.length === events.length) {
    // All invalid — simplest signal is 400 per contract (BLOCKER semantics).
    return json({ error: "all events invalid", rejected, request_id: requestId }, { status: 400 });
  }
  if (rejected.length > 0) {
    // Partial — 207 Multi-Status per contract 02 §Response codes.
    const accepted = events.length - rejected.length;
    logger.info(
      { accepted, rejected: rejected.length, tenant_id: auth.tenantId, request_id: requestId },
      "events partial accept",
    );
    return json({ accepted, rejected, request_id: requestId }, { status: 207 });
  }

  // All valid. Sprint 0: log only; no dedup (Redis SETNX lands in Sprint 1+).
  const accepted = events.length;
  logger.info(
    { accepted, deduped: 0, tenant_id: auth.tenantId, request_id: requestId },
    "events accepted",
  );
  return json({ accepted, deduped: 0, request_id: requestId }, { status: 202 });
}

export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const requestId = crypto.randomUUID();

  if (req.method === "GET" && url.pathname === "/healthz") {
    return json({ status: "ok" });
  }

  if (req.method === "GET" && url.pathname === "/readyz") {
    const deps = await readinessChecks();
    const ok = deps.postgres && deps.clickhouse && deps.redis;
    if (!ok) {
      const failing = Object.entries(deps)
        .filter(([, v]) => !v)
        .map(([k]) => k);
      logger.warn({ deps, failing }, "readyz dep check failed");
      return json({ status: "not-ready", deps }, { status: 503 });
    }
    return json({ status: "ready", deps });
  }

  if (url.pathname === "/v1/events") {
    if (req.method !== "POST") {
      return json({ error: "method not allowed" }, { status: 405 });
    }
    const { store, cache, rateLimiter } = getDeps();
    const auth = await verifyBearer(req.headers.get("authorization"), store, cache);
    if (!auth) {
      return new Response(null, { status: 401 });
    }
    // Rate-limit per (orgId, deviceId). deviceId pulled from optional header.
    const deviceId = req.headers.get("x-device-id") ?? "default";
    const rl = await rateLimiter.consume(auth.tenantId, deviceId, 1);
    if (!rl.allowed) {
      const retryAfter = Math.max(1, Math.ceil(rl.retryAfterMs / 1000)).toString();
      return new Response(
        JSON.stringify({
          error: "rate limit exceeded",
          code: "RATE_LIMITED",
          retry_after_ms: rl.retryAfterMs,
          request_id: requestId,
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": retryAfter,
          },
        },
      );
    }
    const res = await handleEvents(req, auth, requestId);
    // Best-effort rate-limit remaining header on 2xx.
    if (Number.isFinite(rl.remaining)) {
      res.headers.set("x-ratelimit-remaining", String(rl.remaining));
    }
    return res;
  }

  return json({ error: "not found" }, { status: 404 });
}

export function startServer(): ReturnType<typeof Bun.serve> {
  const { hostname, port } = parseListenAddr(process.env.INGEST_LISTEN_ADDR);
  const server = Bun.serve({
    hostname,
    port,
    fetch: handle,
  });
  logger.info({ url: server.url.toString() }, "ingest listening");
  return server;
}
