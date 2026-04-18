import { afterEach, expect, mock, test } from "bun:test";
import { resolveProvider } from "./resolve";
import { NoEmbedProviderError } from "./types";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Mock fetch that responds based on URL prefix. */
function mockFetchBy(map: Record<string, { status: number; body: unknown }>) {
  globalThis.fetch = mock(async (input: unknown) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    for (const [prefix, res] of Object.entries(map)) {
      if (url.startsWith(prefix)) {
        return new Response(JSON.stringify(res.body), {
          status: res.status,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response("not mocked", { status: 503 });
  }) as unknown as typeof fetch;
}

test("resolver: picks OpenAI when OPENAI_API_KEY is set and healthy", async () => {
  mockFetchBy({
    "https://api.openai.com": {
      status: 200,
      body: {
        data: [{ embedding: new Array(512).fill(0) }],
        model: "text-embedding-3-small",
        usage: { prompt_tokens: 1, total_tokens: 1 },
      },
    },
  });
  const p = await resolveProvider({
    env: { OPENAI_API_KEY: "sk-test" },
  });
  expect(p.id).toBe("openai");
});

test("resolver: falls through OpenAI (bad key) to Ollama when reachable", async () => {
  mockFetchBy({
    "https://api.openai.com": { status: 401, body: { error: "unauthorized" } },
    "http://localhost:11434/api/tags": { status: 200, body: { models: [] } },
  });
  const p = await resolveProvider({
    env: { OPENAI_API_KEY: "sk-broken" },
  });
  expect(p.id).toBe("ollama-nomic");
});

test("resolver: air-gapped mode refuses cloud providers even with keys set", async () => {
  mockFetchBy({
    "http://localhost:11434/api/tags": { status: 200, body: { models: [] } },
  });
  const p = await resolveProvider({
    airGapped: true,
    env: { OPENAI_API_KEY: "sk-test", VOYAGE_API_KEY: "pa-test" },
  });
  expect(p.id).toBe("ollama-nomic");
});

test("resolver: EMBEDDING_PROVIDER override wins when healthy", async () => {
  mockFetchBy({
    "https://api.voyageai.com": {
      status: 200,
      body: {
        object: "list",
        data: [{ embedding: new Array(1024).fill(0), index: 0 }],
        model: "voyage-3",
        usage: { total_tokens: 1 },
      },
    },
  });
  const p = await resolveProvider({
    env: {
      EMBEDDING_PROVIDER: "voyage",
      VOYAGE_API_KEY: "pa-test",
      OPENAI_API_KEY: "sk-test",
    },
    // Skip probing ollama/xenova; voyage should be first in chain and healthy.
  });
  expect(p.id).toBe("voyage");
});

test("resolver: throws NoEmbedProviderError when nothing reachable and Xenova unavailable", async () => {
  mockFetchBy({}); // nothing reachable
  await expect(
    resolveProvider({
      airGapped: true,
      env: {}, // no API keys
      // Xenova will fail its health() because @xenova/transformers isn't installed.
    }),
  ).rejects.toBeInstanceOf(NoEmbedProviderError);
});

test("resolver: skipHealth returns the first constructible provider without probing", async () => {
  const p = await resolveProvider({
    env: { OPENAI_API_KEY: "sk-test" },
    skipHealth: true,
  });
  expect(p.id).toBe("openai");
});
