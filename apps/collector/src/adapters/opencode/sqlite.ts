import { Database } from "bun:sqlite";

/**
 * Post-v1.2 OpenCode SQLite schema (subset we rely on).
 *
 * Modelled on sst/opencode's Drizzle schema: one `sessions` table, one
 * `messages` table (role + model + provider + timestamps), one `parts` table
 * for tool calls / tool results / assistant text, and cumulative usage rolled
 * up onto assistant messages. Field names are the ones OpenCode emits; the
 * adapter's internal shape is defined here so normalize.ts doesn't depend on
 * the live DB driver.
 *
 * Invariants (contract 03 §Invariants #2): we open read-only. Opening with
 * `readonly: true` prevents lock escalations that would interfere with the
 * OpenCode process. No UPDATE / INSERT / DDL ever runs against this handle.
 */

export interface RawSessionRow {
  id: string;
  title: string | null;
  time_created: number; // epoch ms
  time_updated: number; // epoch ms
}

export interface RawMessageRow {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system" | "tool";
  provider_id: string | null;
  model_id: string | null;
  time_created: number;
  /** Cumulative assistant-side usage (assistant rows only). */
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cost_usd: number | null;
  finish_reason: string | null;
}

export interface RawPartRow {
  id: string;
  message_id: string;
  session_id: string;
  /** `text` | `tool` | `tool-result` | `reasoning` | other */
  type: string;
  tool_name: string | null;
  tool_call_id: string | null;
  tool_status: "ok" | "error" | "denied" | null;
  tool_duration_ms: number | null;
  time_created: number;
}

export interface OpenCodeSessionPayload {
  session: RawSessionRow;
  messages: RawMessageRow[];
  /** Parts grouped by `message_id`. */
  partsByMessageId: Map<string, RawPartRow[]>;
}

/**
 * Result of an incremental read — the new/updated session payloads plus the
 * highest `time_updated` we observed, formatted as ISO-8601. Callers persist
 * `nextWatermark` to the cursor store and pass it back next tick.
 *
 * `nextWatermark` is null when there were zero rows in the window (first run
 * against an empty DB, or a steady-state poll with no new activity); callers
 * must leave the stored cursor untouched in that case so we don't regress.
 */
export interface IncrementalReadResult {
  payloads: OpenCodeSessionPayload[];
  nextWatermark: string | null;
}

/**
 * Read every session + its messages + parts from the OpenCode DB in a single
 * open/close cycle. `readonly: true` is critical; see invariants above.
 *
 * Retained for the full-rescan path (e.g. post-rotation reset). Steady-state
 * polls use `readSessionsSince` to avoid re-emitting history every tick
 * (Bug #9).
 */
export function readAllSessions(dbPath: string): OpenCodeSessionPayload[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    const sessions = db
      .query<RawSessionRow, []>(
        "SELECT id, title, time_created, time_updated FROM sessions ORDER BY time_created ASC",
      )
      .all();
    return hydrate(db, sessions);
  } finally {
    db.close();
  }
}

/**
 * Incremental read: return only sessions whose `time_updated` is strictly
 * greater than `sinceIso`. On first run (`sinceIso === null`) this is
 * equivalent to `readAllSessions` — we DO want the full history on the first
 * poll, the dedup is only for steady-state ticks.
 *
 * Ordering: `ORDER BY time_updated ASC` guarantees we advance the watermark
 * monotonically and never skip a session whose `time_updated == maxRows-th`
 * boundary — the next tick's `WHERE time_updated > ?` resumes from exactly
 * that boundary.
 *
 * `maxRows` caps the number of sessions returned per tick. If a dev pastes
 * 100k historical sessions at once we'd rather churn through them over
 * several polls than stall a single tick.
 */
export function readSessionsSince(
  dbPath: string,
  sinceIso: string | null,
  maxRows = 10_000,
): IncrementalReadResult {
  const db = new Database(dbPath, { readonly: true });
  try {
    const sessions =
      sinceIso === null
        ? db
            .query<RawSessionRow, [number]>(
              `SELECT id, title, time_created, time_updated FROM sessions
               ORDER BY time_updated ASC LIMIT ?`,
            )
            .all(maxRows)
        : db
            .query<RawSessionRow, [number, number]>(
              `SELECT id, title, time_created, time_updated FROM sessions
               WHERE time_updated > ?
               ORDER BY time_updated ASC LIMIT ?`,
            )
            .all(isoToEpochMs(sinceIso), maxRows);

    if (sessions.length === 0) {
      return { payloads: [], nextWatermark: null };
    }
    const payloads = hydrate(db, sessions);
    let maxSeen = 0;
    for (const s of sessions) {
      if (s.time_updated > maxSeen) maxSeen = s.time_updated;
    }
    return {
      payloads,
      nextWatermark: new Date(maxSeen).toISOString(),
    };
  } finally {
    db.close();
  }
}

function hydrate(db: Database, sessions: RawSessionRow[]): OpenCodeSessionPayload[] {
  const out: OpenCodeSessionPayload[] = [];
  const messageStmt = db.query<RawMessageRow, [string]>(
    `SELECT id, session_id, role, provider_id, model_id, time_created,
            input_tokens, output_tokens, cache_read_input_tokens,
            cache_creation_input_tokens, cost_usd, finish_reason
     FROM messages WHERE session_id = ? ORDER BY time_created ASC`,
  );
  const partsStmt = db.query<RawPartRow, [string]>(
    `SELECT id, message_id, session_id, type, tool_name, tool_call_id,
            tool_status, tool_duration_ms, time_created
     FROM parts WHERE session_id = ? ORDER BY time_created ASC`,
  );
  for (const s of sessions) {
    const messages = messageStmt.all(s.id);
    const parts = partsStmt.all(s.id);
    const partsByMessageId = new Map<string, RawPartRow[]>();
    for (const p of parts) {
      const list = partsByMessageId.get(p.message_id) ?? [];
      list.push(p);
      partsByMessageId.set(p.message_id, list);
    }
    out.push({ session: s, messages, partsByMessageId });
  }
  return out;
}

function isoToEpochMs(iso: string): number {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    // Caller passed garbage — treat as "no watermark" rather than throwing,
    // so a corrupted cursor row degrades to a full re-scan instead of
    // wedging the adapter.
    return 0;
  }
  return parsed;
}
