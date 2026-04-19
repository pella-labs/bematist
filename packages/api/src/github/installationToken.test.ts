// B2 — shared installation-token resolver with Redis-backed cache.

import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import {
  createInMemoryInstallationTokenCache,
  createRedisInstallationTokenCache,
  getInstallationToken,
  type InstallationTokenRedis,
  installationTokenKey,
} from "./installationToken";

function genKey(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ format: "pem", type: "pkcs8" }).toString();
}

function fakeRedis(): {
  store: Map<string, { value: string; expires: number }>;
  client: InstallationTokenRedis;
} {
  const store = new Map<string, { value: string; expires: number }>();
  const client: InstallationTokenRedis = {
    async get(key) {
      const hit = store.get(key);
      if (!hit) return null;
      if (hit.expires <= Date.now()) {
        store.delete(key);
        return null;
      }
      return hit.value;
    },
    async set(key, value, opts) {
      const ttlMs = opts?.PX ?? (opts?.EX ? opts.EX * 1000 : 60_000);
      store.set(key, { value, expires: Date.now() + ttlMs });
      return "OK";
    },
    async del(key) {
      return store.delete(key) ? 1 : 0;
    },
  };
  return { store, client };
}

describe("installationToken — Redis cache", () => {
  test("installationTokenKey uses gh:inst_token:<id> namespace", () => {
    expect(installationTokenKey("42")).toBe("gh:inst_token:42");
  });

  test("cache hit skips the HTTP call", async () => {
    const { client, store } = fakeRedis();
    const cache = createRedisInstallationTokenCache(client);
    store.set(installationTokenKey("inst-1"), {
      value: "preexisting",
      expires: Date.now() + 60_000,
    });
    let fetchCalls = 0;
    const token = await getInstallationToken({
      installationId: "inst-1",
      appId: 1,
      privateKeyPem: genKey(),
      cache,
      fetchFn: (async () => {
        fetchCalls += 1;
        return new Response("{}", { status: 500 });
      }) as unknown as typeof fetch,
    });
    expect(token).toBe("preexisting");
    expect(fetchCalls).toBe(0);
  });

  test("cache miss mints JWT, POSTs, stores with PX = (expires_at − now − refreshWindow)", async () => {
    const { client, store } = fakeRedis();
    const cache = createRedisInstallationTokenCache(client);
    const fakeNow = 1_700_000_000_000;
    const expiresAtMs = fakeNow + 60 * 60 * 1000; // +1h from now
    let fetchCalls = 0;
    const token = await getInstallationToken({
      installationId: "inst-2",
      appId: 123,
      privateKeyPem: genKey(),
      cache,
      now: () => fakeNow,
      fetchFn: (async () => {
        fetchCalls += 1;
        return new Response(
          JSON.stringify({ token: "fresh", expires_at: new Date(expiresAtMs).toISOString() }),
          { status: 201 },
        );
      }) as unknown as typeof fetch,
    });
    expect(token).toBe("fresh");
    expect(fetchCalls).toBe(1);
    const stored = store.get(installationTokenKey("inst-2"));
    expect(stored?.value).toBe("fresh");
  });
});

describe("installationToken — in-memory parity", () => {
  test("in-memory cache supports get/set roundtrip", async () => {
    const cache = createInMemoryInstallationTokenCache();
    await cache.set("inst-3", "tok", 60_000);
    expect(await cache.get("inst-3")).toBe("tok");
  });
});
