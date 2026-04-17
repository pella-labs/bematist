import { afterEach, expect, mock, test } from "bun:test";
import { OllamaEmbedder } from "./ollama";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(response: unknown, status = 200) {
  globalThis.fetch = mock(
    async () =>
      new Response(JSON.stringify(response), {
        status,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch;
}

test("OllamaEmbedder: returns 768-dim vector", async () => {
  mockFetch({ embedding: new Array(768).fill(0.5) });
  const p = new OllamaEmbedder();
  const res = await p.embed({ text: "hi", purpose: "ad-hoc" });
  expect(res.dim).toBe(768);
  expect(res.vector.length).toBe(768);
  expect(res.provider).toBe("ollama-nomic");
});

test("OllamaEmbedder: throws on wrong dim", async () => {
  mockFetch({ embedding: new Array(128).fill(0) });
  const p = new OllamaEmbedder();
  await expect(p.embed({ text: "x", purpose: "ad-hoc" })).rejects.toThrow(/dim 128/);
});

test("OllamaEmbedder: batch runs sequentially", async () => {
  let call = 0;
  globalThis.fetch = mock(async () => {
    const base = call === 0 ? 0.1 : 0.2;
    call++;
    return new Response(JSON.stringify({ embedding: new Array(768).fill(base) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  const p = new OllamaEmbedder();
  const res = await p.embedBatch([
    { text: "a", purpose: "ad-hoc" },
    { text: "b", purpose: "ad-hoc" },
  ]);
  expect(res[0]?.vector[0]).toBeCloseTo(0.1, 5);
  expect(res[1]?.vector[0]).toBeCloseTo(0.2, 5);
});
