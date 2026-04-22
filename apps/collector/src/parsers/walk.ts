import fs from "node:fs";
import path from "node:path";

/**
 * Depth-first generator yielding absolute paths for every file under
 * `dir` whose basename matches `pattern`. Missing roots yield nothing —
 * we only ingest from ~/.claude and ~/.codex, and either may be absent
 * on a machine that hasn't run the corresponding agent.
 */
export function* walkJsonl(dir: string, pattern: RegExp): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkJsonl(full, pattern);
    else if (entry.isFile() && pattern.test(entry.name)) yield full;
  }
}
