// Shared test helpers for the streaming-emit Adapter contract.
//
// Background: as of the 2026-04-19 streaming refactor, Adapter.poll emits
// events via a callback instead of returning Event[]. Tests that want the
// pre-refactor "give me a flat array" ergonomics call collectPoll().

import type { Event } from "@bematist/schema";
import type { Adapter, AdapterContext } from "@bematist/sdk";

export async function collectPoll(
  adapter: Adapter,
  ctx: AdapterContext,
  signal: AbortSignal = new AbortController().signal,
): Promise<Event[]> {
  const out: Event[] = [];
  await adapter.poll(ctx, signal, (e) => out.push(e));
  return out;
}
