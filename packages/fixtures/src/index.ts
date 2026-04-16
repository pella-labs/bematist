import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Event, EventSchema } from "@bematist/schema";

/**
 * Load a golden JSONL fixture for a given adapter source. Each line is parsed
 * with `EventSchema`. Throws on any schema violation so fixtures stay honest.
 *
 * Fixture layout: `packages/fixtures/<source>/session-fixture.jsonl`.
 */
export function loadFixture(source: string): Event[] {
  // import.meta.dir resolves to packages/fixtures/src; step up one to the package root.
  const pkgRoot = resolve(import.meta.dir, "..");
  const path = resolve(pkgRoot, source, "session-fixture.jsonl");
  const raw = readFileSync(path, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);

  return lines.map((line, idx) => {
    const parsed = EventSchema.safeParse(JSON.parse(line));
    if (!parsed.success) {
      throw new Error(
        `loadFixture(${source}): line ${idx + 1} failed EventSchema validation: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  });
}
