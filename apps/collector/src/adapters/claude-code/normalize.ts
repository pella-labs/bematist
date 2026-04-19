import { createHash } from "node:crypto";
import { pricingVersionString } from "@bematist/config";
import type { Event } from "@bematist/schema";
import { log } from "../../logger";
import type { ParsedSession } from "./parsers/parseSessionFile";
import type { RawClaudeContentBlock, RawClaudeSessionLine, RawClaudeUsage } from "./parsers/types";

export interface ServerIdentity {
  tenantId: string;
  engineerId: string;
  deviceId: string;
  tier: "A" | "B" | "C";
}

/**
 * Window in which a per-line `timestamp` is trusted. Outside this window
 * (wildly past, or more than 5 min in the future) we treat the dev's clock
 * as corrupt and clamp to collector-received time. Default is 7 days;
 * override via env `CLAUDE_TS_CLAMP_WINDOW_MS`.
 *
 * Motivation (bug #13a): year-2099 timestamps from corrupted-BIOS dev
 * machines corrupt monthly ClickHouse partitions (`toYYYYMM(ts)` lands in
 * 209x). We clamp silently with a per-session WARN log rather than
 * carrying forward the bad timestamp.
 */
const DEFAULT_TS_CLAMP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const TS_FUTURE_SLACK_MS = 5 * 60 * 1000; // 5-minute future tolerance

function getClampWindowMs(): number {
  const raw = process.env.CLAUDE_TS_CLAMP_WINDOW_MS;
  if (!raw) return DEFAULT_TS_CLAMP_WINDOW_MS;
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n > 0) return n;
  return DEFAULT_TS_CLAMP_WINDOW_MS;
}

/**
 * Attempt to return a clamped ISO timestamp. Returns:
 *   - { iso, clamped: false } if timestamp is within window (or undefined —
 *     caller falls back to `new Date(nowMs)`).
 *   - { iso, clamped: true } if we had to clamp to now.
 * `nowMs` is injected so callers can share a single "poll start" wall time
 * and so tests can pin the clock.
 */
export function resolveTimestamp(
  input: string | undefined,
  nowMs: number,
  windowMs: number = getClampWindowMs(),
): { iso: string; clamped: boolean } {
  if (!input) return { iso: new Date(nowMs).toISOString(), clamped: false };
  const parsed = Date.parse(input);
  if (!Number.isFinite(parsed)) {
    // Unparseable string is as dangerous as a wildly-skewed one.
    return { iso: new Date(nowMs).toISOString(), clamped: true };
  }
  const lowerBound = nowMs - windowMs;
  const upperBound = nowMs + TS_FUTURE_SLACK_MS;
  if (parsed < lowerBound || parsed > upperBound) {
    return { iso: new Date(nowMs).toISOString(), clamped: true };
  }
  return { iso: new Date(parsed).toISOString(), clamped: false };
}

/**
 * Shared per-session clock-skew state. `nowMs` is frozen at the start of
 * normalization so every clamped event lands at the same instant (and
 * tests are deterministic when callers inject a value). `clampedCount` is
 * bumped each time a line's timestamp had to be replaced with `nowMs`.
 * `warned` is the once-per-session gate so a 10k-line clock-skewed session
 * doesn't WARN 10k times.
 */
interface ClampCtx {
  nowMs: number;
  windowMs: number;
  clampedCount: number;
  warned: boolean;
}

export interface NormalizeOpts {
  /** Pinned wall-clock (ms) — test seam for deterministic clamping. */
  nowMs?: number;
  /** Override the clamp window (ms). Defaults to env or 7d. */
  clampWindowMs?: number;
}

const MODEL_PRICING_PER_MTOK: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheCreation: number }
> = {
  // Values in USD per million tokens. Anchored to the LiteLLM pin in @bematist/config.
  // For M1 we carry a minimal table covering the 4.5 / 4.6 family; fully loaded table
  // lands as a generated JSON in M2 via packages/config/pricing.ts.
  "claude-sonnet-4-5": { input: 3.0, output: 15.0, cacheRead: 0.3, cacheCreation: 3.75 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0, cacheRead: 0.3, cacheCreation: 3.75 },
  "claude-opus-4-6": { input: 15.0, output: 75.0, cacheRead: 1.5, cacheCreation: 18.75 },
  "claude-opus-4-7": { input: 15.0, output: 75.0, cacheRead: 1.5, cacheCreation: 18.75 },
  "claude-haiku-4-5": { input: 0.8, output: 4.0, cacheRead: 0.08, cacheCreation: 1.0 },
};

export function normalizeSession(
  parsed: ParsedSession,
  id: ServerIdentity,
  sourceVersion: string,
  opts: NormalizeOpts = {},
): Event[] {
  const session_id = parsed.sessionId ?? "unknown";
  const events: Event[] = [];
  let seq = 0;

  const clampCtx: ClampCtx = {
    nowMs: opts.nowMs ?? Date.now(),
    windowMs: opts.clampWindowMs ?? getClampWindowMs(),
    clampedCount: 0,
    warned: false,
  };

  // Real-format sessions (`~/.claude/projects/**.jsonl`) never emit an explicit
  // `session_start` line — the session begins at the first user message. The
  // fixture format does emit one. Synthesize one here if we're dealing with
  // real-format data (detected by the presence of any top-level `user` /
  // `assistant` type) and there's no explicit session_start in the stream.
  const hasRealFormat = parsed.entries.some((l) => l.type === "user" || l.type === "assistant");
  const hasExplicitStart = parsed.entries.some((l) => l.type === "session_start");
  if (hasRealFormat && !hasExplicitStart && parsed.firstTimestamp) {
    const synthetic: RawClaudeSessionLine = {
      type: "session_start",
      timestamp: parsed.firstTimestamp,
    };
    if (parsed.sessionId) synthetic.sessionId = parsed.sessionId;
    const startEvents = mapLine(
      synthetic,
      -1,
      parsed,
      id,
      sourceVersion,
      session_id,
      seq,
      clampCtx,
    );
    for (const e of startEvents) {
      events.push(e);
      seq++;
    }
  }

  for (let idx = 0; idx < parsed.entries.length; idx++) {
    const line = parsed.entries[idx];
    if (!line) continue;
    const eventsForLine = mapLine(line, idx, parsed, id, sourceVersion, session_id, seq, clampCtx);
    for (const e of eventsForLine) {
      events.push(e);
      seq++;
    }
  }
  return events.map((e, i) => ({ ...e, event_seq: i }));
}

function mapLine(
  line: RawClaudeSessionLine,
  idx: number,
  parsed: ParsedSession,
  id: ServerIdentity,
  sourceVersion: string,
  session_id: string,
  seq: number,
  clampCtx: ClampCtx,
): Event[] {
  const { iso, clamped } = resolveTimestamp(line.timestamp, clampCtx.nowMs, clampCtx.windowMs);
  if (clamped) {
    clampCtx.clampedCount += 1;
    if (!clampCtx.warned) {
      clampCtx.warned = true;
      log.warn(
        {
          session_id,
          originalTs: line.timestamp,
          nowMs: clampCtx.nowMs,
          windowMs: clampCtx.windowMs,
        },
        "claude-code: clock-skewed timestamp clamped to collector-received time",
      );
    }
  }

  // Schema drift note is a Tier-C-only field — it's metadata about the
  // parse, not a counter or a prompt, and only a Tier-C tenant's allowlist
  // permits `raw_attrs` to surface drift markers. Tier A/B instances get
  // the clamp silently (log-only).
  const baseRawAttrs: Record<string, unknown> = {};
  if (clamped && id.tier === "C") {
    baseRawAttrs.schema_drift_note = "ts_clamped";
  }

  const base = {
    schema_version: 1 as const,
    ts: iso,
    tenant_id: id.tenantId,
    engineer_id: id.engineerId,
    device_id: id.deviceId,
    source: "claude-code" as const,
    source_version: sourceVersion,
    fidelity: "full" as const,
    cost_estimated: false,
    tier: id.tier,
    session_id,
    event_seq: seq,
    ...(Object.keys(baseRawAttrs).length > 0 ? { raw_attrs: baseRawAttrs } : {}),
  };

  if (line.type === "session_start") {
    return [
      {
        ...base,
        client_event_id: deterministicId("session_start", session_id, seq, line),
        dev_metrics: {
          event_kind: "session_start",
          duration_ms: 0,
        },
      } as Event,
    ];
  }

  if (line.type === "session_end") {
    return [
      {
        ...base,
        client_event_id: deterministicId("session_end", session_id, seq, line),
        dev_metrics: {
          event_kind: "session_end",
          duration_ms: parsed.durationMs ?? undefined,
        },
      } as Event,
    ];
  }

  if (line.type === "message" && line.message?.role === "user") {
    return [
      {
        ...base,
        client_event_id: deterministicId("llm_request", session_id, seq, line),
        gen_ai: {
          system: "anthropic",
          request: {
            model: line.message?.model,
            max_tokens: 4096,
          },
        },
        dev_metrics: { event_kind: "llm_request" },
      } as Event,
    ];
  }

  if (line.type === "message" && line.message?.role === "assistant") {
    const model = line.message?.model;
    const isOwner = parsed.usageOwnerEntryIdx.has(idx);
    const key = usageKeyFor(line);
    const usage = isOwner && key ? parsed.perUsageKey.get(key) : undefined;
    const cost = isOwner && usage && model ? computeCostUsd(model, usage) : undefined;
    return [
      {
        ...base,
        client_event_id: deterministicId("llm_response", session_id, seq, line),
        gen_ai: {
          system: "anthropic",
          response: {
            model,
            finish_reasons: line.message?.stop_reason ? [line.message.stop_reason] : undefined,
          },
          usage: {
            input_tokens: usage?.input_tokens,
            output_tokens: usage?.output_tokens,
            cache_read_input_tokens: usage?.cache_read_input_tokens,
            cache_creation_input_tokens: usage?.cache_creation_input_tokens,
          },
        },
        dev_metrics: {
          event_kind: "llm_response",
          cost_usd: cost,
          pricing_version: cost !== undefined ? pricingVersionString() : undefined,
        },
      } as Event,
    ];
  }

  if (line.type === "tool_use") {
    return [
      {
        ...base,
        client_event_id: deterministicId("tool_call", session_id, seq, line),
        dev_metrics: {
          event_kind: "tool_call",
          tool_name: line.toolUse?.name,
        },
      } as Event,
    ];
  }

  if (line.type === "tool_result") {
    return [
      {
        ...base,
        client_event_id: deterministicId("tool_result", session_id, seq, line),
        dev_metrics: {
          event_kind: "tool_result",
          tool_name: line.toolUse?.name,
          tool_status: line.toolResult?.isError ? "error" : "ok",
          duration_ms: line.toolResult?.durationMs,
          first_try_failure: line.toolResult?.isError ? true : undefined,
        },
      } as Event,
    ];
  }

  // Real Claude Code JSONL format: top-level `type` is `"user"` / `"assistant"`
  // (vs. the fixture format's `"message"` + nested `role`). Tool calls come
  // embedded in `message.content[]` as typed blocks.
  if (line.type === "user") {
    return mapRealUserLine(line, base, session_id, seq);
  }
  if (line.type === "assistant") {
    return mapRealAssistantLine(line, idx, parsed, base, session_id, seq);
  }
  // `file-history-snapshot`, `system`, and any other unknown kinds are skipped.
  return [];
}

/**
 * Map a real-format `type: "user"` line. User messages in the real format are
 * either plain text (prompt from the developer) or a `tool_result` envelope
 * whose `message.content[]` contains one or more `tool_result` blocks.
 */
function mapRealUserLine(
  line: RawClaudeSessionLine,
  base: EventBase,
  session_id: string,
  seq: number,
): Event[] {
  const content = line.message?.content;
  if (Array.isArray(content)) {
    const out: Event[] = [];
    let i = 0;
    for (const block of content as RawClaudeContentBlock[]) {
      if (block?.type === "tool_result") {
        out.push({
          ...base,
          event_seq: seq + i,
          client_event_id: deterministicId(
            `tool_result:${block.tool_use_id ?? ""}`,
            session_id,
            seq + i,
            line,
          ),
          dev_metrics: {
            event_kind: "tool_result",
            tool_status: block.is_error ? "error" : "ok",
            first_try_failure: block.is_error ? true : undefined,
          },
        } as Event);
        i++;
      }
    }
    return out;
  }
  // Plain user prompt — one llm_request-style event with no model info.
  return [
    {
      ...base,
      client_event_id: deterministicId("user_prompt", session_id, seq, line),
      dev_metrics: { event_kind: "llm_request" },
    } as Event,
  ];
}

/**
 * Map a real-format `type: "assistant"` line. Emits one `llm_response` event
 * (with usage + cost) plus one `tool_call` event per `tool_use` content block.
 */
function mapRealAssistantLine(
  line: RawClaudeSessionLine,
  idx: number,
  parsed: ParsedSession,
  base: EventBase,
  session_id: string,
  seq: number,
): Event[] {
  const model = line.message?.model;
  const isOwner = parsed.usageOwnerEntryIdx.has(idx);
  const key = usageKeyFor(line);
  const usage = isOwner && key ? parsed.perUsageKey.get(key) : undefined;
  const cost = isOwner && usage && model ? computeCostUsd(model, usage) : undefined;

  const events: Event[] = [
    {
      ...base,
      client_event_id: deterministicId("llm_response", session_id, seq, line),
      gen_ai: {
        system: "anthropic",
        response: {
          model,
          finish_reasons: line.message?.stop_reason ? [line.message.stop_reason] : undefined,
        },
        usage: {
          input_tokens: usage?.input_tokens,
          output_tokens: usage?.output_tokens,
          cache_read_input_tokens: usage?.cache_read_input_tokens,
          cache_creation_input_tokens: usage?.cache_creation_input_tokens,
        },
      },
      dev_metrics: {
        event_kind: "llm_response",
        cost_usd: cost,
        pricing_version: cost !== undefined ? pricingVersionString() : undefined,
      },
    } as Event,
  ];

  // tool_use blocks embedded in message.content[] → tool_call events.
  const content = line.message?.content;
  if (Array.isArray(content)) {
    let i = 1; // event_seq offset — `llm_response` took seq+0.
    for (const block of content as RawClaudeContentBlock[]) {
      if (block?.type === "tool_use") {
        events.push({
          ...base,
          event_seq: seq + i,
          client_event_id: deterministicId(
            `tool_call:${block.id ?? ""}`,
            session_id,
            seq + i,
            line,
          ),
          dev_metrics: {
            event_kind: "tool_call",
            tool_name: block.name,
          },
        } as Event);
        i++;
      }
    }
  }
  return events;
}

type EventBase = {
  schema_version: 1;
  ts: string;
  tenant_id: string;
  engineer_id: string;
  device_id: string;
  source: "claude-code";
  source_version: string;
  fidelity: "full";
  cost_estimated: boolean;
  tier: "A" | "B" | "C";
  session_id: string;
  event_seq: number;
  raw_attrs?: Record<string, unknown>;
};

/**
 * Resolve a per-MTok price sheet for a Claude model slug. Matches grammata's
 * `getClaudePricing`: exact match → longest-prefix exact match → family
 * fallback (`claude-opus-4-*`, `claude-sonnet-4-*`, `claude-haiku-4-*`) →
 * last-resort sonnet pricing. This keeps dated variants (`claude-opus-4-7`,
 * `claude-opus-4-5-20251101`, etc.) priced instead of dropping to $0.
 */
function getClaudePricing(model: string): {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
} {
  const exact = MODEL_PRICING_PER_MTOK[model];
  if (exact) return exact;
  const normalized = model.toLowerCase();
  const prefixMatch = Object.entries(MODEL_PRICING_PER_MTOK)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([key]) => normalized.startsWith(key.toLowerCase()));
  if (prefixMatch) return prefixMatch[1];
  if (normalized.startsWith("claude-opus-4")) {
    // biome-ignore lint/style/noNonNullAssertion: key is statically present.
    return MODEL_PRICING_PER_MTOK["claude-opus-4-6"]!;
  }
  if (normalized.startsWith("claude-sonnet-4")) {
    // biome-ignore lint/style/noNonNullAssertion: key is statically present.
    return MODEL_PRICING_PER_MTOK["claude-sonnet-4-6"]!;
  }
  if (normalized.startsWith("claude-haiku-4")) {
    // biome-ignore lint/style/noNonNullAssertion: key is statically present.
    return MODEL_PRICING_PER_MTOK["claude-haiku-4-5-20251001"]!;
  }
  if (normalized.startsWith("claude-haiku-3-5")) {
    // biome-ignore lint/style/noNonNullAssertion: key is statically present.
    return MODEL_PRICING_PER_MTOK["claude-haiku-3-5"]!;
  }
  return { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 };
}

function computeCostUsd(model: string, u: RawClaudeUsage): number {
  const p = getClaudePricing(model);
  const input = (u.input_tokens ?? 0) / 1_000_000;
  const output = (u.output_tokens ?? 0) / 1_000_000;
  const cacheRead = (u.cache_read_input_tokens ?? 0) / 1_000_000;
  const cacheCreation = (u.cache_creation_input_tokens ?? 0) / 1_000_000;
  const cost =
    input * p.input + output * p.output + cacheRead * p.cacheRead + cacheCreation * p.cacheCreation;
  return Math.round(cost * 1e6) / 1e6;
}

function usageKeyFor(line: RawClaudeSessionLine): string | undefined {
  return line.message?.id ?? line.requestId ?? line.uuid;
}

function deterministicId(
  kind: string,
  session_id: string,
  seq: number,
  line: RawClaudeSessionLine,
): string {
  const raw = `claude-code|${session_id}|${seq}|${kind}|${JSON.stringify(line)}`;
  const hex = createHash("sha256").update(raw).digest("hex");
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // where y is one of [8, 9, a, b]
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    `4${hex.substring(12, 15)}`,
    `${((Number.parseInt(hex.substring(15, 16), 16) & 0x3) | 0x8).toString(16)}${hex.substring(16, 19)}`,
    hex.substring(19, 31),
  ].join("-");
}
