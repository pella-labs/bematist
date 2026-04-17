import { afterEach, expect, mock, test } from "bun:test";
import { VoyageEmbedder } from "./voyage";

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

test("VoyageEmbedder: returns 1024-dim vector", async () => {
  mockFetch({
    object: "list",
    data: [{ embedding: new Array(1024).fill(0.3), index: 0 }],
    model: "voyage-3",
    usage: { total_tokens: 5 },
  });
  const p = new VoyageEmbedder({ apiKey: "pa-test" });
  const res = await p.embed({ text: "hi", purpose: "ad-hoc" });
  expect(res.dim).toBe(1024);
  expect(res.vector.length).toBe(1024);
  expect(res.provider).toBe("voyage");
});

test("VoyageEmbedder: batch reorders by response index", async () => {
  mockFetch({
    object: "list",
    data: [
      { embedding: new Array(1024).fill(0.9), index: 1 }, // arrives out of order
      { embedding: new Array(1024).fill(0.1), index: 0 },
    ],
    model: "voyage-3",
    usage: { total_tokens: 10 },
  });
  const p = new VoyageEmbedder({ apiKey: "pa-test" });
  const results = await p.embedBatch([
    { text: "first", purpose: "ad-hoc" },
    { text: "second", purpose: "ad-hoc" },
  ]);
  expect(results[0]?.vector[0]).toBeCloseTo(0.1, 5);
  expect(results[1]?.vector[0]).toBeCloseTo(0.9, 5);
});

test("VoyageEmbedder: constructor requires apiKey", () => {
  expect(() => new VoyageEmbedder({ apiKey: "" })).toThrow(/apiKey/);
});
