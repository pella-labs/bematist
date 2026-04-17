import { copyFileSync, existsSync, renameSync, writeFileSync } from "node:fs";

export async function atomicWrite(path: string, content: string): Promise<void> {
  if (existsSync(path)) {
    copyFileSync(path, `${path}.bak`);
  }
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, path);
}

/** Minimal unified-diff implementation — good enough for CLI preview, not a library replacement. */
export function unifiedDiff(a: string, b: string): string {
  if (a === b) return "";
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const out: string[] = [];
  const max = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < max; i++) {
    const l = aLines[i];
    const r = bLines[i];
    if (l === r) continue;
    if (l !== undefined) out.push(`-${l}`);
    if (r !== undefined) out.push(`+${r}`);
  }
  return out.join("\n");
}
