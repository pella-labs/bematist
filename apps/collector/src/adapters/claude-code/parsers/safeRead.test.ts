import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLinesFromOffset } from "./safeRead";

test("reads all lines from offset 0 on a small file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-read-"));
  const path = join(dir, "small.jsonl");
  writeFileSync(path, '{"a":1}\n{"b":2}\n{"c":3}\n');
  const { lines, nextOffset } = await readLinesFromOffset(path, 0);
  expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  expect(nextOffset).toBe(24);
  rmSync(dir, { recursive: true, force: true });
});

test("resumes from a non-zero offset", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-read-"));
  const path = join(dir, "resume.jsonl");
  writeFileSync(path, '{"a":1}\n{"b":2}\n{"c":3}\n');
  const { lines, nextOffset } = await readLinesFromOffset(path, 8);
  expect(lines).toEqual(['{"b":2}', '{"c":3}']);
  expect(nextOffset).toBe(24);
  rmSync(dir, { recursive: true, force: true });
});

test("handles a 60 MB file without dropping lines", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-read-"));
  const path = join(dir, "big.jsonl");
  // Make 60MB of JSONL: 60_000 lines × ~1KB each.
  const line = `{"k":"${"x".repeat(1000)}"}\n`;
  const fd = Bun.file(path).writer();
  for (let i = 0; i < 60_000; i++) fd.write(line);
  await fd.end();
  const { lines } = await readLinesFromOffset(path, 0);
  expect(lines.length).toBe(60_000);
  rmSync(dir, { recursive: true, force: true });
}, 60_000);

test("ignores empty trailing newline", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-read-"));
  const path = join(dir, "trail.jsonl");
  writeFileSync(path, '{"a":1}\n\n');
  const { lines } = await readLinesFromOffset(path, 0);
  expect(lines).toEqual(['{"a":1}']);
  rmSync(dir, { recursive: true, force: true });
});

test("returns nextOffset unchanged if offset is past EOF", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-read-"));
  const path = join(dir, "eof.jsonl");
  writeFileSync(path, '{"a":1}\n');
  const { lines, nextOffset } = await readLinesFromOffset(path, 999);
  expect(lines).toEqual([]);
  expect(nextOffset).toBe(999);
  rmSync(dir, { recursive: true, force: true });
});

test("decodes UTF-16 LE with BOM — Claude Code on Windows", async () => {
  // Reproduces the M4 Windows-onboarding bug: every line tripped
  // "Unrecognized token '\\u0000'" because utf8 decoding of UTF-16 LE
  // bytes leaves a null after every ASCII char.
  const dir = mkdtempSync(join(tmpdir(), "bematist-read-"));
  const path = join(dir, "win-bom.jsonl");
  const content = '{"a":1}\r\n{"b":2}\r\n{"c":3}\r\n';
  // UTF-16 LE BOM + CRLF, mirroring the on-disk shape we've observed.
  const bom = Buffer.from([0xff, 0xfe]);
  const body = Buffer.from(content, "utf16le");
  writeFileSync(path, Buffer.concat([bom, body]));
  const { lines } = await readLinesFromOffset(path, 0);
  expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  rmSync(dir, { recursive: true, force: true });
});

test("decodes UTF-16 LE without BOM — sniffs null-density heuristic", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-read-"));
  const path = join(dir, "win-nobom.jsonl");
  const content = '{"a":1}\r\n{"b":2}\r\n{"c":3}\r\n';
  writeFileSync(path, Buffer.from(content, "utf16le"));
  const { lines } = await readLinesFromOffset(path, 0);
  expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  rmSync(dir, { recursive: true, force: true });
});

test("strips UTF-8 BOM if present", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-read-"));
  const path = join(dir, "utf8-bom.jsonl");
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  writeFileSync(path, Buffer.concat([bom, Buffer.from('{"a":1}\n{"b":2}\n')]));
  const { lines } = await readLinesFromOffset(path, 0);
  expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  rmSync(dir, { recursive: true, force: true });
});

test("strips trailing CR from CRLF line terminators", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bematist-read-"));
  const path = join(dir, "crlf.jsonl");
  writeFileSync(path, '{"a":1}\r\n{"b":2}\r\n');
  const { lines } = await readLinesFromOffset(path, 0);
  expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  rmSync(dir, { recursive: true, force: true });
});
