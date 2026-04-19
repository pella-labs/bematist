// Unit tests — deterministic, no timers.

import { describe, expect, test } from "bun:test";
import { WindowCoalescer } from "./coalescer";

describe("WindowCoalescer", () => {
  test("N messages for same (tenant, session) within window → 1 flush", async () => {
    let clock = 1_000;
    const c = new WindowCoalescer({ windowMs: 30_000, now: () => clock });
    c.add({ tenant_id: "t1", session_id: "s1" }, "webhook_pr_upsert");
    c.add({ tenant_id: "t1", session_id: "s1" }, "webhook_push");
    c.add({ tenant_id: "t1", session_id: "s1" }, "webhook_pr_upsert");
    expect(c.size()).toBe(1);

    clock += 30_000; // window elapses
    const flushed: string[] = [];
    const n = await c.flushDue(async (k, e) => {
      flushed.push(`${k.tenant_id}/${k.session_id}:${e.count}`);
    });
    expect(n).toBe(1);
    expect(flushed).toEqual(["t1/s1:3"]);
    expect(c.size()).toBe(0);
  });

  test("distinct sessions flush independently", async () => {
    let clock = 0;
    const c = new WindowCoalescer({ windowMs: 30_000, now: () => clock });
    c.add({ tenant_id: "t1", session_id: "a" }, "x");
    clock += 10_000;
    c.add({ tenant_id: "t1", session_id: "b" }, "x");
    clock += 25_000; // a is due, b is not
    const emittedKeys: string[] = [];
    await c.flushDue(async (k) => {
      emittedKeys.push(k.session_id);
    });
    expect(emittedKeys).toEqual(["a"]);
    expect(c.size()).toBe(1);
  });

  test("installation-state triggers signal immediate flush intent", () => {
    const c = new WindowCoalescer({ windowMs: 30_000, now: () => 0 });
    const r = c.add({ tenant_id: "t1", session_id: "s1" }, "webhook_installation_state");
    expect(r.immediate).toBe(true);
    const r2 = c.add({ tenant_id: "t1", session_id: "s1" }, "webhook_pr_upsert");
    expect(r2.immediate).toBe(false);
  });

  test("flushOne executes regardless of age", async () => {
    const c = new WindowCoalescer({ windowMs: 30_000, now: () => 0 });
    c.add({ tenant_id: "t", session_id: "s" }, "x");
    expect(c.dueKeys()).toHaveLength(0); // not yet due
    let called = 0;
    await c.flushOne({ tenant_id: "t", session_id: "s" }, async () => {
      called += 1;
    });
    expect(called).toBe(1);
    expect(c.size()).toBe(0);
  });

  test("handler error re-queues entry with original firstSeenAt", async () => {
    let clock = 0;
    const c = new WindowCoalescer({ windowMs: 30_000, now: () => clock });
    c.add({ tenant_id: "t", session_id: "s" }, "x");
    clock = 35_000;
    await expect(
      c.flushDue(async () => {
        throw new Error("downstream failed");
      }),
    ).rejects.toThrow("downstream failed");
    // Still pending — retry on next flush
    expect(c.size()).toBe(1);
    const emitted: number[] = [];
    await c.flushDue(async (_k, e) => {
      emitted.push(e.count);
    });
    expect(emitted).toEqual([1]);
  });

  test("drainAll empties regardless of age", async () => {
    const c = new WindowCoalescer({ windowMs: 30_000, now: () => 0 });
    c.add({ tenant_id: "t", session_id: "a" }, "x");
    c.add({ tenant_id: "t", session_id: "b" }, "x");
    expect(c.dueKeys()).toHaveLength(0);
    let n = 0;
    await c.drainAll(async () => {
      n += 1;
    });
    expect(n).toBe(2);
    expect(c.size()).toBe(0);
  });
});
