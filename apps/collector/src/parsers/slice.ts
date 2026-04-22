import fs from "node:fs";

/**
 * Read `absPath` from `startOffset` to EOF and return every newline-
 * terminated line, plus the byte offset up to which lines were fully
 * consumed. The trailing fragment (an incomplete line still being
 * written by the agent) is deliberately excluded — the caller stores
 * `bytesConsumed` as the new cursor so the next tick picks up that
 * fragment once the newline arrives.
 *
 * Returns { lines: [], bytesConsumed: fileSize } for an unchanged or
 * missing file so the caller can advance the cursor uniformly.
 */
export function readNewLines(
  absPath: string,
  startOffset: number,
): { lines: string[]; bytesConsumed: number; fileSize: number } {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absPath);
  } catch {
    return { lines: [], bytesConsumed: startOffset, fileSize: 0 };
  }
  const size = stat.size;
  if (size <= startOffset) return { lines: [], bytesConsumed: size, fileSize: size };

  const len = size - startOffset;
  const buf = Buffer.alloc(len);
  let fd: number | null = null;
  try {
    fd = fs.openSync(absPath, "r");
    let total = 0;
    while (total < len) {
      const read = fs.readSync(fd, buf, total, len - total, startOffset + total);
      if (read <= 0) break;
      total += read;
    }
    fd = (fs.closeSync(fd), null);
  } catch {
    if (fd !== null) try { fs.closeSync(fd); } catch {}
    return { lines: [], bytesConsumed: startOffset, fileSize: size };
  }

  const slice = buf.toString("utf8");
  const lastNewline = slice.lastIndexOf("\n");
  if (lastNewline < 0) {
    // no newline in this read — the trailing fragment is still incomplete
    return { lines: [], bytesConsumed: startOffset, fileSize: size };
  }
  const complete = slice.slice(0, lastNewline);
  const bytesConsumed = startOffset + Buffer.byteLength(complete, "utf8") + 1;
  const lines = complete.length === 0 ? [] : complete.split("\n");
  return { lines, bytesConsumed, fileSize: size };
}
