import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { OpenAIEmbedder } from "./openai";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Each test installs its own fetch mock.
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(response: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  const status = init.status ?? 200;
  globalThis.fetch = mock(
    async () =>
      new Response(JSON.stringify(response), {
        status,
        headers: { "content-type": "application/json" },
        // Response default `ok` derives from status; forcing status handles both.
      }),
  ) as unknown as typeof fetch;
  void ok; // intentional unused — status handles .ok
}

test("OpenAIEmbedder: single embed returns a vector of declared dim", async () => {
  const dim = 512;
  mockFetch({
    data: [{ embedding: new Array(dim).fill(0.1) }],
    model: "text-embedding-3-small",
    usage: { prompt_tokens: 2, total_tokens: 2 },
  });
  const p = new OpenAIEmbedder({ apiKey: "sk-test", dim });
  const res = await p.embed({ text: "hello", purpose: "ad-hoc" });
  expect(res.vector.length).toBe(dim);
  expect(res.dim).toBe(dim);
  expect(res.provider).toBe("openai");
  expect(res.cached).toBe(false);
  expect(res.vector instanceof Float32Array).toBe(true);
});

test("OpenAIEmbedder: batch preserves order", async () => {
  const dim = 512;
  mockFetch({
    data: [{ embedding: new Array(dim).fill(0.1) }, { embedding: new Array(dim).fill(0.2) }],
    model: "text-embedding-3-small",
    usage: { prompt_tokens: 4, total_tokens: 4 },
  });
  const p = new OpenAIEmbedder({ apiKey: "sk-test", dim });
  const results = await p.embedBatch([
    { text: "a", purpose: "ad-hoc" },
    { text: "b", purpose: "ad-hoc" },
  ]);
  expect(results).toHaveLength(2);
  expect(results[0]?.vector[0]).toBeCloseTo(0.1, 5);
  expect(results[1]?.vector[0]).toBeCloseTo(0.2, 5);
});

test("OpenAIEmbedder: throws on dim mismatch", async () => {
  mockFetch({
    data: [{ embedding: new Array(256).fill(0) }], // wrong dim
    model: "text-embedding-3-small",
    usage: { prompt_tokens: 0, total_tokens: 0 },
  });
  const p = new OpenAIEmbedder({ apiKey: "sk-test", dim: 512 });
  await expect(p.embed({ text: "x", purpose: "ad-hoc" })).rejects.toThrow(/dim 256/);
});

test("OpenAIEmbedder: throws on HTTP error", async () => {
  mockFetch({ error: "boom" }, { status: 500 });
  const p = new OpenAIEmbedder({ apiKey: "sk-test" });
  await expect(p.embed({ text: "x", purpose: "ad-hoc" })).rejects.toThrow(/500/);
});

test("OpenAIEmbedder: constructor requires apiKey", () => {
  expect(() => new OpenAIEmbedder({ apiKey: "" })).toThrow(/apiKey/);
});
