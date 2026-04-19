import { log } from "../../../logger";
import { readLinesFromOffset } from "./safeRead";
import type {
  RawCodexLine,
  RawCodexPayload,
  RawCodexSessionMeta,
  RawCodexTurnContext,
} from "./types";

export interface CodexUsageSnapshot {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  total_tokens: number;
}

export interface CodexTurnUsage extends CodexUsageSnapshot {
  /** Cumulative snapshot observed on this turn. Stored so the next poll can
   *  diff against it even if earlier events have scrolled off. */
  cumulative: CodexUsageSnapshot;
  model?: string;
  timestamp: string;
  turn_id?: string;
}

export interface ParsedCodexSession {
  sessionId: string | null;
  entries: RawCodexLine[];
  /** Per-turn deltas derived from cumulative token_count snapshots (D17).
   *  Map keyed on the synthesised turn key — `turn_id` if present, else
   *  `sequence#<n>`. Max-per-field dedup across repeated cumulative snapshots
   *  for the same turn (cumulative can only grow). */
  perTurnUsage: Map<string, CodexTurnUsage>;
  /** Last cumulative snapshot observed in the file; persisted across polls
   *  so resumed tailing keeps diffing correctly (stateful running total). */
  lastCumulative: CodexUsageSnapshot | null;
  /** Summed across every per-turn delta. */
  usageTotals: CodexUsageSnapshot;
  /** lastTimestamp − firstTimestamp in ms. Null if < 2 timestamps (D17). */
  durationMs: number | null;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  /** session_meta payload (cwd, model_provider, optional gitBranch). */
  sessionMeta: RawCodexSessionMeta | null;
  /** Latest active model seen anywhere in the rollout — turn_context is
   *  authoritative; token_count.payload.model is a fallback. Used to stamp
   *  gen_ai_request_model when per-turn isn't granular. */
  activeModel: string | null;
  /** Collection of tool invocations (exec_command / apply_patch). Key is the
   *  derived tool_name (command basename, or "apply_patch"); value is count.
   *  Mined for tool_name attribution — NOT a privacy-sensitive surface. */
  toolBreakdown: Map<string, number>;
}

export interface ParseOptions {
  /** Running total carried in from the cursor so a mid-session resume still
   *  diffs correctly. Defaults to all-zero. */
  priorCumulative?: CodexUsageSnapshot | null;
}

const ZERO_SNAPSHOT: CodexUsageSnapshot = {
  input_tokens: 0,
  output_tokens: 0,
  cached_input_tokens: 0,
  total_tokens: 0,
};

export async function parseSessionFile(
  path: string,
  opts: ParseOptions = {},
): Promise<ParsedCodexSession> {
  const { lines } = await readLinesFromOffset(path, 0);
  return parseLines(lines, opts);
}

export function parseLines(lines: string[], opts: ParseOptions = {}): ParsedCodexSession {
  const entries: RawCodexLine[] = [];
  const perTurnUsage = new Map<string, CodexTurnUsage>();
  let lastCumulative: CodexUsageSnapshot | null = opts.priorCumulative ?? null;
  let firstTimestamp: string | null = null;
  let lastTimestamp: string | null = null;
  let sessionId: string | null = null;
  let tokenCountSeq = 0;
  let sessionMeta: RawCodexSessionMeta | null = null;
  let activeModel: string | null = null;
  const toolBreakdown = new Map<string, number>();

  for (const raw of lines) {
    let parsed: RawCodexLine;
    try {
      parsed = JSON.parse(raw) as RawCodexLine;
    } catch (e) {
      log.warn({ err: String(e) }, "codex: skipping malformed JSONL line");
      continue;
    }
    entries.push(parsed);

    if (parsed.session_id && !sessionId) sessionId = parsed.session_id;
    if (parsed.timestamp) {
      if (!firstTimestamp) firstTimestamp = parsed.timestamp;
      lastTimestamp = parsed.timestamp;
    }

    const kind = extractKind(parsed);
    const payload = extractPayload(parsed);

    // session_meta: Codex writes one per rollout (cwd, originator, etc.).
    if (kind === "session_meta" && payload) {
      sessionMeta = payload as RawCodexSessionMeta;
      if (!sessionId && sessionMeta.id) sessionId = sessionMeta.id;
    }

    // turn_context: authoritative source of the active model for a turn.
    // Newer Codex CLI no longer stamps model on token_count; turn_context is
    // the only place we reliably see `gpt-5.3-codex` / `gpt-5.4` / etc.
    if (kind === "turn_context" && payload) {
      const tc = payload as RawCodexTurnContext;
      const model =
        tc.collaboration_mode?.settings?.model ?? tc.model ?? (payload as RawCodexPayload).model;
      if (model) activeModel = model;
    }

    if (kind === "token_count" && payload) {
      // Newer CLI: `payload.info` is null on rate-limit-only pings — skip,
      // they carry no usage. Anything else either has info.total_token_usage
      // or flat top-level fields; snapshotFromPayload handles both shapes.
      if (payload.info === null) continue;
      const cumulative = snapshotFromPayload(payload);
      if (!hasAnyUsage(cumulative)) continue;
      const prior = lastCumulative ?? ZERO_SNAPSHOT;
      const delta: CodexUsageSnapshot = {
        input_tokens: nonNegativeDelta(cumulative.input_tokens, prior.input_tokens),
        output_tokens: nonNegativeDelta(cumulative.output_tokens, prior.output_tokens),
        cached_input_tokens: nonNegativeDelta(
          cumulative.cached_input_tokens,
          prior.cached_input_tokens,
        ),
        total_tokens: nonNegativeDelta(cumulative.total_tokens, prior.total_tokens),
      };
      const turnKey = parsed.turn_id ?? `sequence#${tokenCountSeq}`;
      tokenCountSeq++;

      // Max-per-field dedup (D17). If a turn's cumulative is ever re-emitted
      // in a later line (CLI flush), keep the field-wise max delta we've seen.
      const prev = perTurnUsage.get(turnKey);
      const merged: CodexTurnUsage = {
        input_tokens: Math.max(prev?.input_tokens ?? 0, delta.input_tokens),
        output_tokens: Math.max(prev?.output_tokens ?? 0, delta.output_tokens),
        cached_input_tokens: Math.max(prev?.cached_input_tokens ?? 0, delta.cached_input_tokens),
        total_tokens: Math.max(prev?.total_tokens ?? 0, delta.total_tokens),
        cumulative,
        timestamp: parsed.timestamp ?? prev?.timestamp ?? "",
      };
      // Prefer explicit payload model, then prior-known, then latest turn_context.
      const model = payload.model ?? prev?.model ?? activeModel ?? undefined;
      if (model !== undefined) merged.model = model;
      const turnId = parsed.turn_id ?? prev?.turn_id;
      if (turnId !== undefined) merged.turn_id = turnId;
      perTurnUsage.set(turnKey, merged);
      lastCumulative = cumulative;
    }

    // toolBreakdown mining — count invocations by derived tool name so
    // Dashboard "Insights → tool usage" has non-empty data without any
    // prompt-text exposure. Keys: "apply_patch" for patch_apply_start, or
    // the first whitespace-delimited token of exec_command payload.command.
    if (kind === "exec_command_start" && payload?.command) {
      const name = deriveToolNameFromCommand(payload.command);
      toolBreakdown.set(name, (toolBreakdown.get(name) ?? 0) + 1);
    }
    if (kind === "patch_apply_start") {
      toolBreakdown.set("apply_patch", (toolBreakdown.get("apply_patch") ?? 0) + 1);
    }
  }

  const usageTotals: CodexUsageSnapshot = { ...ZERO_SNAPSHOT };
  for (const u of perTurnUsage.values()) {
    usageTotals.input_tokens += u.input_tokens;
    usageTotals.output_tokens += u.output_tokens;
    usageTotals.cached_input_tokens += u.cached_input_tokens;
    usageTotals.total_tokens += u.total_tokens;
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
    perTurnUsage,
    lastCumulative,
    usageTotals,
    durationMs,
    firstTimestamp,
    lastTimestamp,
    sessionMeta,
    activeModel,
    toolBreakdown,
  };
}

/**
 * Derive a stable tool_name from a shell command. First whitespace token
 * (`bun test` → "bun"; `/usr/bin/git status` → "git"). Strips path and
 * trailing colon/quotes. Returns "shell" as a safe fallback when input is
 * empty or looks like pure shell syntax (e.g. "&&").
 */
export function deriveToolNameFromCommand(command: string): string {
  if (!command) return "shell";
  // Take first whitespace-delimited token; strip leading quotes and any path prefix.
  const first = command
    .trim()
    .split(/\s+/, 1)[0]
    ?.replace(/^['"]+|['"]+$/g, "");
  if (!first) return "shell";
  const base = first.split("/").pop() ?? first;
  // Guard against pure operators / flags.
  if (!/^[A-Za-z0-9_.+-]+$/.test(base)) return "shell";
  return base;
}

export function extractKind(line: RawCodexLine): string | undefined {
  // Three rollout shapes to cover:
  //   1. Wrapped nested:  { event_msg: { type, payload } }
  //   2. Bare top-level:  { type, payload }
  //   3. Real-CLI wrapper: { type: "event_msg", payload: { type: <real>, ... } }
  //      — here the inner `payload.type` IS the event kind.
  const wrapped = line.event_msg?.type;
  if (wrapped) return wrapped;
  const outer = line.type;
  if (outer === "event_msg" && line.payload?.type) return line.payload.type;
  return outer;
}

export function extractPayload(line: RawCodexLine): RawCodexPayload | undefined {
  // For the real-CLI wrapper (`type:"event_msg"`), the inner payload IS the
  // effective payload (fields like input_tokens, model live there).
  if (line.type === "event_msg" && line.payload) return line.payload;
  return line.event_msg?.payload ?? line.payload;
}

/**
 * Build a cumulative CodexUsageSnapshot from a token_count payload, covering
 * BOTH Codex CLI shapes:
 *
 *   - New (rollouts from CLI ≥ ~0.80):
 *       payload.info.total_token_usage.{input_tokens,output_tokens,cached_input_tokens,total_tokens}
 *
 *   - Old / test fixtures:
 *       payload.{input_tokens,output_tokens,cached_input_tokens,total_tokens}
 *
 * Preference is `info.total_token_usage` (cumulative, grammata's reference
 * source), then flat top-level. `reasoning_output_tokens` is NOT added to
 * `output_tokens` — grammata excludes it, and our downstream pricing matches
 * grammata ±0 when we match their inclusion rules.
 */
function snapshotFromPayload(p: RawCodexPayload): CodexUsageSnapshot {
  const total = p.info?.total_token_usage;
  if (total) {
    return {
      input_tokens: total.input_tokens ?? 0,
      output_tokens: total.output_tokens ?? 0,
      cached_input_tokens: total.cached_input_tokens ?? 0,
      total_tokens: total.total_tokens ?? 0,
    };
  }
  return {
    input_tokens: p.input_tokens ?? 0,
    output_tokens: p.output_tokens ?? 0,
    cached_input_tokens: p.cached_input_tokens ?? 0,
    total_tokens: p.total_tokens ?? 0,
  };
}

function hasAnyUsage(s: CodexUsageSnapshot): boolean {
  return (
    s.input_tokens > 0 || s.output_tokens > 0 || s.cached_input_tokens > 0 || s.total_tokens > 0
  );
}

function nonNegativeDelta(curr: number, prior: number): number {
  const d = curr - prior;
  return d > 0 ? d : 0;
}

export { ZERO_SNAPSHOT };
