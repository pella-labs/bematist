import { describe, expect, test } from "bun:test";
import {
  createInMemoryRecomputeStream,
  RECOMPUTE_SCHEMA_VERSION,
  type RecomputeMessage,
} from "./recomputeStream";

function msg(partial: Partial<RecomputeMessage> = {}): RecomputeMessage {
  return {
    schema_version: RECOMPUTE_SCHEMA_VERSION,
    trigger: "webhook_pr_upsert",
    tenant_id: "00000000-0000-0000-0000-000000000001",
    installation_id: "42424242",
    received_at: new Date().toISOString(),
    payload: { pr_number: 1 },
    ...partial,
  };
}

describe("InMemoryRecomputeStream", () => {
  test("publish assigns monotonic ids per stream", async () => {
    const s = createInMemoryRecomputeStream();
    const a = await s.publish(msg());
    const b = await s.publish(msg());
    expect(a).not.toBe(b);
    expect(s.readStream("00000000-0000-0000-0000-000000000001").length).toBe(2);
  });

  test("streams are per-tenant", async () => {
    const s = createInMemoryRecomputeStream();
    await s.publish(msg({ tenant_id: "tenant-A" }));
    await s.publish(msg({ tenant_id: "tenant-B" }));
    expect(s.readStream("tenant-A").length).toBe(1);
    expect(s.readStream("tenant-B").length).toBe(1);
    expect(s.allTenants().sort()).toEqual(["tenant-A", "tenant-B"]);
  });

  test("close → subsequent publish throws", async () => {
    const s = createInMemoryRecomputeStream();
    await s.close();
    await expect(s.publish(msg())).rejects.toThrow("recompute-stream:closed");
  });

  test("schema_version is pinned at 1", () => {
    expect(RECOMPUTE_SCHEMA_VERSION).toBe(1);
  });
});
