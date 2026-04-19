import type { Adapter, AdapterContext, EventEmitter } from "@bematist/sdk";
import { log } from "../logger";
import { Semaphore } from "./semaphore";

export interface RunOptions {
  concurrency: number;
  perPollTimeoutMs: number;
}

/**
 * Run every adapter's poll() concurrently (bounded by `opts.concurrency`).
 * Adapters stream events via the `emit` callback as they produce them
 * (typically per-file for file-tailing adapters), so the journal sees
 * events per-file rather than one giant batch at poll end. A slow-walking
 * adapter no longer blocks the flush loop — flush runs independently on
 * its own interval in loop.ts and drains whatever's already been emitted.
 *
 * On timeout: the abort signal fires. Adapters MUST honor it — the
 * contract is "finish the current file and return promptly." Anything
 * the adapter emitted before abort is already durable in the journal, so
 * a timed-out poll no longer loses work the way the old
 * `Promise<Event[]>`-returning version did (Walid's 4,971-file backfill —
 * it timed out at 30s, returned [], and subsequent polls skipped those
 * files because cursor signatures marked them "done").
 *
 * A misbehaving adapter that ignores the signal can still hang this
 * function longer than `perPollTimeoutMs`. Known trade-off — but because
 * emits stream durably, the user still sees a rising queue and dashboard
 * rather than a silent 20-minute window.
 */
export async function runOnce(
  adapters: Adapter[],
  ctxFactory: (adapter: Adapter) => AdapterContext,
  opts: RunOptions,
  emit: EventEmitter,
): Promise<void> {
  const sem = new Semaphore(opts.concurrency);
  await Promise.all(
    adapters.map(async (a) => {
      await sem.acquire();
      try {
        const ctx = ctxFactory(a);
        const ac = new AbortController();
        const timer =
          opts.perPollTimeoutMs > 0
            ? setTimeout(() => {
                ac.abort();
                log.debug(
                  { adapter: a.id, ms: opts.perPollTimeoutMs },
                  "adapter poll timeout — signaling abort",
                );
              }, opts.perPollTimeoutMs)
            : null;
        try {
          await a.poll(ctx, ac.signal, emit);
        } catch (e) {
          log.warn({ adapter: a.id, err: String(e) }, "adapter poll failed");
        } finally {
          if (timer) clearTimeout(timer);
        }
      } finally {
        sem.release();
      }
    }),
  );
}

export { Semaphore } from "./semaphore";
