import { statSync } from "node:fs";
import { log } from "../../../logger";
import { readLinesFromOffset as realReadLinesFromOffset } from "./safeRead";
import type { RawClaudeSessionLine, RawClaudeUsage } from "./types";

/**
 * Hard byte cap on any single JSONL we parse. Files larger than this are
 * tailed: we skip everything before `size - maxFileBytes` and drop the
 * first (partial) line in the remaining window. Guards against OOM / poll
 * timeouts on multi-GB historical sessions (observed 2.8 GB real case —
 * Walid, see collector config.ts rationale).
 *
 * Tradeoff: when we truncate from the front we LOSE any early-session
 * events beyond the tail window. In steady state the adapter's `max_seq`
 * cursor tracks what's been emitted so subsequent polls resume where the
 * last left off — truncation only bites on the first poll catching up to a
 * file that was already beyond the cap when the collector started.
 */
const DEFAULT_MAX_FILE_BYTES = 512 * 1024 * 1024; // 512 MiB
const DEFAULT_MAX_LINES = 2_000_000;

export interface ParseSessionFileOpts {
  /**
   * Hard byte cap. Files larger than this are tailed — we read only the last
   * `maxFileBytes` bytes and discard the first partial line. Defaults to 512
   * MiB; env override `BEMATIST_CLAUDE_MAX_BYTES` picked up by the adapter.
   */
  maxFileBytes?: number;
  /**
   * Hard line cap. If the parsed buffer exceeds this many lines (after the
   * byte tail is applied), we keep the tail-most `maxLines` only. Defaults
   * to 2,000,000; env override `BEMATIST_CLAUDE_MAX_LINES` picked up by the
   * adapter.
   */
  maxLines?: number;
  /**
   * Test seams — do NOT use from product code. Let the 600-MiB integration
   * test verify the tail offset without writing an actual giant file (and
   * without using `mock.module`, which leaks process-wide in Bun and breaks
   * neighbouring tests that use the real reader).
   */
  _statSync?: (path: string) => { size: number };
  _readLinesFromOffset?: (
    path: string,
    offset: number,
  ) => Promise<{ lines: string[]; nextOffset: number }>;
}

export interface ParsedSession {
  sessionId: string | null;
  entries: RawClaudeSessionLine[];
  /**
   * Per-requestId max-per-field usage. Kept for back-compat; new code should
   * prefer `perUsageKey` which matches grammata's dedup semantics (keyed by
   * `message.id || requestId || uuid`). `perRequestUsage` only has an entry
   * when the line carries a `requestId`, so it silently drops lines that
   * only have `message.id` or `uuid`.
   */
  perRequestUsage: Map<string, RawClaudeUsage>;
  /**
   * Per-dedup-key max-per-field usage. The key selector is
   * `message.id || requestId || uuid || synthetic`, matching grammata/claude.js.
   * This is the authoritative usage map — normalize emits usage/cost on
   * exactly one llm_response per key, preventing the 2-8× token inflation
   * that streaming partials caused when we emitted usage on every assistant
   * line (each line carried the deduped cumulative total → summing lines
   * multiplied tokens by turns-per-key).
   */
  perUsageKey: Map<string, RawClaudeUsage>;
  /**
   * Map of entry index → dedup key, for every assistant line that carried
   * usage. Normalize walks `entries` in order and looks up this map to
   * decide which line "owns" the usage emission for its key (the first one
   * seen). Lines whose index is the *owner* emit usage + cost; later lines
   * sharing the key emit an llm_response event with no usage and no cost.
   */
  usageKeyByEntryIdx: Map<number, string>;
  /**
   * Set of entry indices that are the *owner* of their usage key — i.e.,
   * the first assistant line observed for that key. Emit usage/cost only
   * here.
   */
  usageOwnerEntryIdx: Set<number>;
  /** Summed across all dedup keys (grammata-compatible). */
  usageTotals: Required<RawClaudeUsage>;
  /** lastTimestamp − firstTimestamp in ms. Null if < 2 timestamps. */
  durationMs: number | null;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  /**
   * True iff the source file exceeded `maxFileBytes` or `maxLines` and we
   * tailed it. Adapter logs this so operators can see which sessions are
   * dropping early events.
   */
  truncated: boolean;
}

/**
 * Parse a Claude Code session JSONL file.
 *
 * D17 P0 fixes baked in:
 *   1. Per-requestId dedup with Map<requestId, usage>, max-per-field.
 *   2. durationMs = lastTimestamp − firstTimestamp.
 *   3. Safe file reader — no 50 MB silent-drop limit.
 *   4. Bounded memory: files over `maxFileBytes` (default 512 MiB) are
 *      tailed rather than read whole. Prevents multi-GB historical JSONL
 *      from OOM-ing the collector or blowing through the orchestrator
 *      per-poll timeout.
 *
 * Line-parse failures log warn and skip that line; a corrupted tail line never
 * kills the whole session.
 */
export async function parseSessionFile(
  path: string,
  opts: ParseSessionFileOpts = {},
): Promise<ParsedSession> {
  const maxFileBytes = opts.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
  const stat = opts._statSync ?? statSync;
  const readLinesFromOffset = opts._readLinesFromOffset ?? realReadLinesFromOffset;

  let size = 0;
  try {
    size = stat(path).size;
  } catch {
    // File gone between discovery and parse — readLinesFromOffset(path, 0)
    // will also fail cleanly; let it produce an empty result.
    return parseLines([], false);
  }

  let offset = 0;
  let truncated = false;
  if (size > maxFileBytes) {
    offset = size - maxFileBytes;
    truncated = true;
    log.warn(
      { path, size, maxFileBytes, offset },
      "claude-code: JSONL exceeds max bytes — tailing last window, early events dropped",
    );
  }

  const { lines: rawLines } = await readLinesFromOffset(path, offset);

  // When we started mid-file, the first line we got is almost certainly a
  // fragment from the middle of a JSON object — drop it.
  let lines = rawLines;
  if (offset > 0 && lines.length > 0) {
    lines = lines.slice(1);
  }

  if (lines.length > maxLines) {
    log.warn(
      { path, lineCount: lines.length, maxLines },
      "claude-code: JSONL exceeds max lines — keeping tail only",
    );
    lines = lines.slice(lines.length - maxLines);
    truncated = true;
  }

  return parseLines(lines, truncated);
}

export function parseLines(lines: string[], truncated = false): ParsedSession {
  const entries: RawClaudeSessionLine[] = [];
  const perRequestUsage = new Map<string, RawClaudeUsage>();
  const perUsageKey = new Map<string, RawClaudeUsage>();
  const usageKeyByEntryIdx = new Map<number, string>();
  const usageOwnerEntryIdx = new Set<number>();
  const seenKeys = new Set<string>();
  let firstTimestamp: string | null = null;
  let lastTimestamp: string | null = null;
  let sessionId: string | null = null;

  for (const raw of lines) {
    let parsed: RawClaudeSessionLine;
    try {
      parsed = JSON.parse(raw) as RawClaudeSessionLine;
    } catch (e) {
      log.warn({ err: String(e) }, "claude-code: skipping malformed JSONL line");
      continue;
    }
    const entryIdx = entries.length;
    entries.push(parsed);

    if (parsed.sessionId && !sessionId) sessionId = parsed.sessionId;
    if (parsed.timestamp) {
      if (!firstTimestamp) firstTimestamp = parsed.timestamp;
      lastTimestamp = parsed.timestamp;
    }

    const usage = parsed.message?.usage;
    const rid = parsed.requestId;
    if (usage) {
      // Back-compat: keep the requestId-keyed map populated when requestId
      // exists so older callers don't break.
      if (rid) {
        const prior = perRequestUsage.get(rid) ?? {};
        const input = max(prior.input_tokens, usage.input_tokens);
        const output = max(prior.output_tokens, usage.output_tokens);
        const cacheRead = max(prior.cache_read_input_tokens, usage.cache_read_input_tokens);
        const cacheCreation = max(
          prior.cache_creation_input_tokens,
          usage.cache_creation_input_tokens,
        );
        const next: RawClaudeUsage = {};
        if (input !== undefined) next.input_tokens = input;
        if (output !== undefined) next.output_tokens = output;
        if (cacheRead !== undefined) next.cache_read_input_tokens = cacheRead;
        if (cacheCreation !== undefined) next.cache_creation_input_tokens = cacheCreation;
        perRequestUsage.set(rid, next);
      }

      // Grammata-style dedup: prefer `message.id`, then `requestId`, then
      // `uuid`, then a per-entry synthetic. This groups Claude Code's
      // mid-stream partial + final assistant records — they share
      // requestId/message.id but the final record carries cumulative usage;
      // naive summation would double-count every turn.
      const usageKey = parsed.message?.id ?? rid ?? parsed.uuid ?? `anon-${perUsageKey.size}`;
      usageKeyByEntryIdx.set(entryIdx, usageKey);
      if (!seenKeys.has(usageKey)) {
        seenKeys.add(usageKey);
        usageOwnerEntryIdx.add(entryIdx);
      }
      const priorKey = perUsageKey.get(usageKey) ?? {};
      const ki = max(priorKey.input_tokens, usage.input_tokens);
      const ko = max(priorKey.output_tokens, usage.output_tokens);
      const kcr = max(priorKey.cache_read_input_tokens, usage.cache_read_input_tokens);
      const kcc = max(priorKey.cache_creation_input_tokens, usage.cache_creation_input_tokens);
      const next2: RawClaudeUsage = {};
      if (ki !== undefined) next2.input_tokens = ki;
      if (ko !== undefined) next2.output_tokens = ko;
      if (kcr !== undefined) next2.cache_read_input_tokens = kcr;
      if (kcc !== undefined) next2.cache_creation_input_tokens = kcc;
      perUsageKey.set(usageKey, next2);
    }
  }

  const usageTotals = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  for (const u of perUsageKey.values()) {
    usageTotals.input_tokens += u.input_tokens ?? 0;
    usageTotals.output_tokens += u.output_tokens ?? 0;
    usageTotals.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
    usageTotals.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
  }

  let durationMs: number | null = null;
  if (firstTimestamp && lastTimestamp && firstTimestamp !== lastTimestamp) {
    durationMs = Date.parse(lastTimestamp) - Date.parse(firstTimestamp);
  } else if (firstTimestamp && lastTimestamp) {
    durationMs = 0;
  }

  return {
    sessionId,
    entries,
    perRequestUsage,
    perUsageKey,
    usageKeyByEntryIdx,
    usageOwnerEntryIdx,
    usageTotals,
    durationMs,
    firstTimestamp,
    lastTimestamp,
    truncated,
  };
}

function max(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}
