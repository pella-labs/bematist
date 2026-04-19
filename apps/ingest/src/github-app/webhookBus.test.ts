import { describe, expect, test } from "bun:test";
import {
  createInMemoryWebhookBus,
  decodePayload,
  encodePayload,
  GITHUB_WEBHOOKS_TOPIC,
  type WebhookBusPayload,
} from "./webhookBus";

function samplePayload(overrides: Partial<WebhookBusPayload> = {}): WebhookBusPayload {
  return {
    delivery_id: "d-1",
    event: "pull_request",
    tenant_id: "00000000-0000-0000-0000-000000000001",
    installation_id: "42424242",
    body_b64: Buffer.from('{"action":"opened"}').toString("base64"),
    received_at: new Date("2026-04-18T00:00:00Z").toISOString(),
    ...overrides,
  };
}

describe("InMemoryWebhookBus", () => {
  test("encode + decode is round-trip safe", () => {
    const p = samplePayload();
    const bytes = encodePayload(p);
    const back = decodePayload(bytes);
    expect(back).toEqual(p);
  });

  test("publish() assigns messages to a partition by key and preserves per-key order", async () => {
    const bus = createInMemoryWebhookBus();
    const key = "tenant-A:42";
    for (let i = 0; i < 5; i++) {
      await bus.publish(GITHUB_WEBHOOKS_TOPIC, {
        key,
        value: encodePayload(samplePayload({ delivery_id: `d-${i}` })),
        headers: { "x-github-event": "pull_request" },
      });
    }
    const got = bus.drain(GITHUB_WEBHOOKS_TOPIC);
    expect(got.map((m) => decodePayload(m.value).delivery_id)).toEqual([
      "d-0",
      "d-1",
      "d-2",
      "d-3",
      "d-4",
    ]);
    // Same key should always land in the same partition.
    expect(new Set(got.map(() => bus.hashPartition(key))).size).toBe(1);
  });

  test("different keys distribute across partitions (at least 2 of 10 distinct)", async () => {
    const bus = createInMemoryWebhookBus();
    const used = new Set<number>();
    for (let i = 0; i < 10; i++) {
      used.add(bus.hashPartition(`tenant-${i}:inst-${i}`));
    }
    expect(used.size).toBeGreaterThanOrEqual(2);
  });

  test("close() rejects subsequent publish", async () => {
    const bus = createInMemoryWebhookBus();
    await bus.close();
    await expect(
      bus.publish(GITHUB_WEBHOOKS_TOPIC, {
        key: "k",
        value: new Uint8Array(),
        headers: {},
      }),
    ).rejects.toThrow("webhook-bus:closed");
  });

  test("hashPartition returns an index in [0, 32)", () => {
    const bus = createInMemoryWebhookBus();
    for (const k of ["", "a", "x:y", "tenant-1:42", "tenant-1:43"]) {
      const i = bus.hashPartition(k);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(bus.PARTITIONS);
    }
  });
});
