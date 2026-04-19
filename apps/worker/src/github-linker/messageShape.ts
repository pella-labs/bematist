// Unified decoder for the two producer shapes writing into
// `session_repo_recompute:<tenant_id>` Redis Streams.
//
// Producer #1 — apps/ingest/src/github-app/recomputeStream.ts
//   Shape: { schema_version: 1, trigger, tenant_id, installation_id,
//            received_at, payload }
//   Published by apps/worker/src/github/consumer.ts on webhook UPSERTs.
//
// Producer #2 — apps/worker/src/github-initial-sync/recomputeEmitter.ts
//   Shape: flat fields { tenant_id, provider_repo_id, reason, at }
//   Written by `redis.xadd(stream, fields)` — each field string-coerced.
//
// Consumer (this file) tolerates both. Unknown shapes → `null` (caller
// logs + XACK to avoid DLQ poisoning).

export type LinkerTriggerKind =
  | "webhook_pr_upsert"
  | "webhook_push"
  | "webhook_check_suite"
  | "webhook_installation_state"
  | "webhook_repository_rename_or_transfer"
  | "initial_sync_new_repo"
  | "tracking_mode_flipped"
  | "tracking_state_flipped";

export interface LinkerMessage {
  shape: "webhook" | "sync";
  tenant_id: string;
  /** Present for webhook shape; absent for sync shape. */
  installation_id: string | null;
  trigger: LinkerTriggerKind;
  /** Session id (extracted from payload where available; null when the
   *  producer emits a tenant-wide trigger that fans out server-side). */
  session_id: string | null;
  /** The raw payload map — callers may introspect when they need it. */
  payload: Record<string, unknown>;
}

/**
 * Node-redis XREADGROUP returns fields as a flat alternating array of
 * [field, value, field, value, ...]. Normalise to Record<string,string>.
 */
export function fieldsToRecord(fields: unknown): Record<string, string> {
  if (fields instanceof Map) return Object.fromEntries(fields as Map<string, string>);
  if (Array.isArray(fields)) {
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < fields.length; i += 2) out[String(fields[i])] = String(fields[i + 1]);
    return out;
  }
  if (fields && typeof fields === "object") return fields as Record<string, string>;
  return {};
}

export function decodeMessage(fields: Record<string, string>): LinkerMessage | null {
  // Webhook shape: body JSON-encoded under a `body` field, or fields
  // directly spread. Producer currently stores the full message as JSON
  // under a single well-known field because node-redis's xadd signature
  // writes Record<string,string>.
  if (typeof fields.body === "string") {
    try {
      const parsed = JSON.parse(fields.body) as {
        schema_version?: number;
        trigger?: string;
        tenant_id?: string;
        installation_id?: string;
        payload?: Record<string, unknown>;
      };
      if (parsed.schema_version === 1 && parsed.trigger && parsed.tenant_id) {
        return {
          shape: "webhook",
          tenant_id: parsed.tenant_id,
          installation_id: parsed.installation_id ?? null,
          trigger: parsed.trigger as LinkerTriggerKind,
          session_id: null, // webhook triggers fan out to all live sessions
          payload: parsed.payload ?? {},
        };
      }
    } catch {
      return null;
    }
  }

  // Sync shape: flat fields with `tenant_id`, `provider_repo_id`, `reason`, `at`.
  if (fields.tenant_id && fields.reason) {
    const trigger = fields.reason as LinkerTriggerKind;
    return {
      shape: "sync",
      tenant_id: fields.tenant_id,
      installation_id: null,
      trigger,
      session_id: null, // tenant-wide flip; fans out to all sessions in the tenant
      payload: { provider_repo_id: fields.provider_repo_id, at: fields.at },
    };
  }

  // Webhook shape flattened as top-level fields (not wrapped in `body`).
  if (fields.trigger && fields.tenant_id && fields.schema_version === "1") {
    return {
      shape: "webhook",
      tenant_id: fields.tenant_id,
      installation_id: fields.installation_id ?? null,
      trigger: fields.trigger as LinkerTriggerKind,
      session_id: fields.session_id ?? null,
      payload: safeParseJson(fields.payload),
    };
  }

  return null;
}

function safeParseJson(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Serialise a webhook-shape RecomputeMessage for xadd. The producer in
 * apps/worker/src/github/consumer.ts builds the typed object and we
 * stringify as `body` here for wire parity with the sync shape's flat
 * fields.
 */
export function encodeWebhookMessage(msg: {
  schema_version: 1;
  trigger: LinkerTriggerKind;
  tenant_id: string;
  installation_id: string;
  received_at: string;
  payload: Record<string, unknown>;
}): Record<string, string> {
  return { body: JSON.stringify(msg) };
}
