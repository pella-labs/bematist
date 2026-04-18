import { statSync } from "node:fs";
import { open } from "node:fs/promises";

/**
 * Read newline-delimited lines from `offset` to EOF. No 50 MB silent-drop limit
 * (D17 fix). Returns the new offset so callers can resume.
 *
 * Implementation reads a chunk at a time into a Buffer, splits on \n, keeps
 * the trailing partial line for the next read. Streaming-safe.
 *
 * Encoding detection (M4 Windows fix): Claude Code on Windows has been
 * observed writing `~/.claude/projects/*.jsonl` in UTF-16 LE — decoding as
 * UTF-8 makes every ASCII character pair render as `<char>\u0000<char>…`
 * and every JSON.parse trips on the embedded null byte. First chunk is
 * sniffed for a BOM or a high odd-byte-null density; once encoding is
 * decided it sticks for the rest of the file.
 *
 * CRLF tolerance: Windows line terminators arrive as `…}\r\n`. Split on
 * `\n` then strip a trailing `\r` so the JSON.parse downstream doesn't
 * choke on carriage returns.
 */

type Encoding = "utf8" | "utf16le";

interface EncodingDecision {
  encoding: Encoding;
  /** Bytes to skip at the start of the file (BOM length). */
  bomLength: number;
}

/**
 * Decide a file's text encoding from its first chunk. Preference order:
 *   1. UTF-8 BOM (`EF BB BF`) → UTF-8, skip 3 bytes.
 *   2. UTF-16 LE BOM (`FF FE`) → UTF-16 LE, skip 2 bytes.
 *   3. No BOM: if ≥40% of odd-indexed bytes in the first ~512 bytes are
 *      `0x00`, assume UTF-16 LE (every ASCII char's high byte is 0 in LE).
 *   4. Fall back to UTF-8.
 *
 * UTF-16 BE is intentionally unhandled — vanishingly rare in the real world
 * and not observed on any Claude Code install. Flag if it ever shows up.
 */
export function detectEncoding(buf: Buffer, bytesRead: number): EncodingDecision {
  if (bytesRead >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { encoding: "utf8", bomLength: 3 };
  }
  if (bytesRead >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { encoding: "utf16le", bomLength: 2 };
  }
  const sample = Math.min(bytesRead, 512);
  if (sample >= 4) {
    let oddNulls = 0;
    let oddTotal = 0;
    for (let i = 1; i < sample; i += 2) {
      if (buf[i] === 0x00) oddNulls++;
      oddTotal++;
    }
    if (oddTotal > 0 && oddNulls / oddTotal >= 0.4) {
      return { encoding: "utf16le", bomLength: 0 };
    }
  }
  return { encoding: "utf8", bomLength: 0 };
}

export async function readLinesFromOffset(
  path: string,
  offset: number,
): Promise<{ lines: string[]; nextOffset: number }> {
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return { lines: [], nextOffset: offset };
  }
  if (offset >= size) return { lines: [], nextOffset: offset };

  const fh = await open(path, "r");
  try {
    const CHUNK = 64 * 1024;
    const buf = Buffer.alloc(CHUNK);
    let pos = offset;
    let residual = "";
    const lines: string[] = [];
    let encoding: Encoding = "utf8";
    let encodingDecided = false;

    while (pos < size) {
      const { bytesRead } = await fh.read(buf, 0, Math.min(CHUNK, size - pos), pos);
      if (bytesRead === 0) break;
      let chunkStart = 0;
      if (!encodingDecided) {
        const decision = detectEncoding(buf, bytesRead);
        encoding = decision.encoding;
        // BOM only lives at the very start of the file; anywhere else it's
        // content and must not be stripped.
        if (pos === 0) chunkStart = decision.bomLength;
        encodingDecided = true;
      }
      const chunk = residual + buf.toString(encoding, chunkStart, bytesRead);
      const parts = chunk.split("\n");
      residual = parts.pop() ?? "";
      for (const p of parts) {
        const clean = p.endsWith("\r") ? p.slice(0, -1) : p;
        if (clean.length > 0) lines.push(clean);
      }
      pos += bytesRead;
    }
    if (residual.length > 0) {
      const clean = residual.endsWith("\r") ? residual.slice(0, -1) : residual;
      if (clean.length > 0) lines.push(clean);
    }
    return { lines, nextOffset: size };
  } finally {
    await fh.close();
  }
}
