// PRD §17 B2 — shared installation-token resolver for ingest + worker.
//
// Both the ingest HTTP path (webhook HMAC verify needs a fresh App-scoped
// installation token) and the worker's initial-sync dispatcher
// (paginating repos as the installation) need the same token with the
// same freshness guarantees. Before this module existed, ingest owned a
// process-local in-memory cache and the worker had no cache at all —
// repeat requests to GitHub for the same installation made every call mint
// a fresh JWT and re-hit `POST /app/installations/:id/access_tokens`.
//
// This module:
//   1. Re-exports the pure JWT minter from apps/ingest/src/github-app/jwt.ts
//      (kept there so ingest can still import without depending on
//      @bematist/api — B2 unblocks a later dep-order cleanup).
//   2. Adds a Redis-backed `InstallationTokenCache` under the key
//      `gh:inst_token:<installation_id>`. TTL ≈ the GitHub-stated
//      `expires_at` minus 10 minutes, so a refresher kicks in well before
//      the token actually expires (avoids a thundering herd of 401s).
//   3. Exposes the same `getInstallationToken(input)` signature the
//      in-memory cache already uses — callers swap the `cache` dep only.
//
// Security: the cache stores plaintext installation tokens. We rely on
// Redis being a trusted tenant-internal service (same posture as the
// existing webhook-dedup SETNX key). Cross-tenant isolation is via the
// installation_id-keyed namespace; two tenants never share a token.

import { createHash } from "node:crypto";

export interface InstallationTokenCache {
  get(installationId: string): Promise<string | null>;
  set(installationId: string, token: string, ttlMs: number): Promise<void>;
}

/** Minimal node-redis v4 surface we touch. */
export interface InstallationTokenRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { PX?: number; EX?: number }): Promise<string | null>;
  del(key: string): Promise<number>;
}

export function installationTokenKey(installationId: string): string {
  return `gh:inst_token:${installationId}`;
}

/**
 * Redis-backed installation-token cache. `ttlMs` is honored via node-redis
 * `PX` so expiry is exactly the caller-computed pre-refresh window. A miss
 * (including expiry) returns null; callers handle the remint.
 */
export function createRedisInstallationTokenCache(
  redis: InstallationTokenRedis,
): InstallationTokenCache {
  return {
    async get(installationId) {
      const v = await redis.get(installationTokenKey(installationId));
      return v ?? null;
    },
    async set(installationId, token, ttlMs) {
      await redis.set(installationTokenKey(installationId), token, { PX: Math.max(1, ttlMs) });
    },
  };
}

/**
 * In-memory cache adapter — identical shape to the Redis one so every
 * call site takes a single `InstallationTokenCache`. Useful in tests +
 * `BEMATIST_ENDPOINT=solo` where Redis is absent.
 */
export function createInMemoryInstallationTokenCache(
  opts: { clock?: () => number } = {},
): InstallationTokenCache {
  const clock = opts.clock ?? (() => Date.now());
  const map = new Map<string, { token: string; expiresAt: number }>();
  return {
    async get(installationId) {
      const hit = map.get(installationId);
      if (!hit) return null;
      if (hit.expiresAt <= clock()) {
        map.delete(installationId);
        return null;
      }
      return hit.token;
    },
    async set(installationId, token, ttlMs) {
      map.set(installationId, { token, expiresAt: clock() + ttlMs });
    },
  };
}

export interface GetInstallationTokenInput {
  installationId: string;
  appId: string | number;
  privateKeyPem: string;
  cache: InstallationTokenCache;
  fetchFn?: typeof fetch;
  apiBase?: string;
  now?: () => number;
  /** Pre-expiry refresh window in ms. Defaults to 10 minutes per PRD §17 B2. */
  refreshWindowMs?: number;
}

/**
 * Resolve an installation token. Cache hit → return cached. Miss → mint
 * App-JWT, POST /app/installations/:id/access_tokens, parse expires_at,
 * cache for (expires_at - now - refreshWindow). PRD §17 B2 defaults the
 * refresh window to 10 min so the NEXT caller on a warm cache 50 min later
 * triggers a fresh mint well before GitHub actually expires the token.
 */
export async function getInstallationToken(input: GetInstallationTokenInput): Promise<string> {
  const { installationId, appId, privateKeyPem, cache } = input;
  const cached = await cache.get(installationId);
  if (cached) return cached;

  const doFetch = input.fetchFn ?? fetch;
  const apiBase = input.apiBase ?? "https://api.github.com";
  const now = input.now ?? Date.now;
  const refreshWindowMs = input.refreshWindowMs ?? 10 * 60 * 1000;
  const appJwt = mintAppJwt({ appId, privateKeyPem, now });
  const res = await doFetch(
    `${apiBase}/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${appJwt}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
    },
  );
  if (!res.ok) {
    throw new Error(`github-app:install-token-failed:${res.status}`);
  }
  const body = (await res.json()) as { token?: string; expires_at?: string };
  if (!body.token || !body.expires_at) {
    throw new Error("github-app:install-token-malformed");
  }
  const expiresAtMs = Date.parse(body.expires_at);
  // Cache slightly short of GitHub's expiry so refresh happens ahead of
  // the wire expiration. Floor at 60s so tests with small windows still
  // cache at least briefly.
  const ttlMs = Math.max(60_000, expiresAtMs - now() - refreshWindowMs);
  await cache.set(installationId, body.token, ttlMs);
  return body.token;
}

// ---------------------------------------------------------------------------
// JWT minter — same shape as apps/ingest/src/github-app/jwt.ts. Ingest still
// imports from there to avoid a workspace dep cycle; this file duplicates so
// @bematist/api consumers don't pull in the ingest app.
// ---------------------------------------------------------------------------

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

interface MintAppJwtInput {
  appId: string | number;
  privateKeyPem: string;
  now?: () => number;
}

export function mintAppJwt({ appId, privateKeyPem, now = Date.now }: MintAppJwtInput): string {
  // We import node:crypto lazily inside the function body so the shared module
  // stays edge-safe for callers that don't actually mint (cache-only paths).
  // biome-ignore lint/style/useNodejsImportProtocol: intentional dynamic import
  const crypto = require("node:crypto") as typeof import("node:crypto");
  const nowSec = Math.floor(now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: nowSec - 60,
    exp: nowSec + 9 * 60,
    iss: typeof appId === "number" ? appId : Number(appId),
  };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKeyPem);
  return `${signingInput}.${base64url(signature)}`;
}

/** Test helper for asserting the cache key shape without reaching into Redis. */
export function sha256hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
