// Redpanda (Kafka-compatible) producer interface for the GitHub webhook
// ingest pipeline (PRD §7.1).
//
// The ingest server emits ONE message per first-sight webhook to topic
// `github.webhooks`; a `apps/worker/github` consumer drains it and performs
// the domain UPSERTs. Topic config is LOCKED at 32 partitions, key=tenant_id
// + ':' + installation_id (per-tenant ordering preserved per partition).
//
// Why a narrow interface: the Bema tech stack locks Redpanda, but the
// root package.json does not yet pin a Kafka client library. Per CLAUDE.md
// "No new runtime npm deps without justification" we do NOT add one here —
// the parent human agent's call-out on this PR decides between:
//
//   A) kafkajs (pure JS, zero native deps, Bun-compatible)
//   B) @confluentinc/kafka-javascript (librdkafka bindings, higher
//      throughput, but native module → may need the ingest-sidecar pattern)
//
// Until then, the production-ready shape + fully-tested in-memory bus land
// in this PR so the downstream consumer (this file's counterpart in the
// worker) can be built against a stable interface.
//
// The in-memory bus preserves key-based ordering per partition (hash the
// key the same way Redpanda does, modulo partition count) so tests see the
// same delivery ordering semantics as prod.

export interface WebhookBusMessage {
  key: string;
  value: Uint8Array;
  headers: Readonly<Record<string, string>>;
}

export interface WebhookBusProducer {
  /**
   * Publish a message to `topic`. Resolves when the broker has acked
   * (`acks=all` semantics). Rejects only on retryable failure after the
   * configured retry budget is exhausted — callers treat the rejection as
   * a 5xx to the upstream webhook so GitHub retries.
   */
  publish(topic: string, msg: WebhookBusMessage): Promise<void>;

  /** Graceful drain + disconnect. Idempotent. */
  close(): Promise<void>;
}

/**
 * In-memory producer. Used by tests and by the worker's consumer test suite
 * so the producer+consumer wire up end-to-end without a real broker.
 */
export class InMemoryWebhookBus implements WebhookBusProducer {
  readonly PARTITIONS = 32;
  private readonly topics = new Map<string, WebhookBusMessage[][]>();
  private closed = false;

  getPartitions(topic: string): WebhookBusMessage[][] {
    let t = this.topics.get(topic);
    if (!t) {
      t = Array.from({ length: this.PARTITIONS }, () => []);
      this.topics.set(topic, t);
    }
    return t;
  }

  hashPartition(key: string): number {
    // Murmur-lite FNV-1a. Not bit-compat with Redpanda's murmur2 default, but
    // deterministic enough for test-time ordering assertions (same key →
    // same partition index within tests).
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h % this.PARTITIONS;
  }

  async publish(topic: string, msg: WebhookBusMessage): Promise<void> {
    if (this.closed) throw new Error("webhook-bus:closed");
    const parts = this.getPartitions(topic);
    const idx = this.hashPartition(msg.key);
    const partition = parts[idx];
    if (!partition) throw new Error("webhook-bus:partition-missing");
    partition.push({ ...msg, headers: { ...msg.headers } });
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  /** Test helper: flatten all partitions in publish-order per partition. */
  drain(topic: string): WebhookBusMessage[] {
    const parts = this.topics.get(topic);
    if (!parts) return [];
    const out: WebhookBusMessage[] = [];
    for (const p of parts) {
      for (const m of p) out.push(m);
      p.length = 0;
    }
    return out;
  }

  /** Test helper: peek partition contents without draining. */
  peek(topic: string): WebhookBusMessage[] {
    const parts = this.topics.get(topic);
    if (!parts) return [];
    const out: WebhookBusMessage[] = [];
    for (const p of parts) {
      for (const m of p) out.push({ ...m });
    }
    return out;
  }
}

export function createInMemoryWebhookBus(): InMemoryWebhookBus {
  return new InMemoryWebhookBus();
}

/** Payload shape for `github.webhooks` messages. Encoded as JSON bytes. */
export interface WebhookBusPayload {
  delivery_id: string;
  event: string;
  /** Tenant UUID resolved at ingest time from github_installations. */
  tenant_id: string;
  installation_id: string;
  /** Raw webhook body (Base64) — preserved so the worker can re-verify if desired. */
  body_b64: string;
  /** ISO-8601 timestamp the ingest accepted the message. */
  received_at: string;
}

export function encodePayload(p: WebhookBusPayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodePayload(bytes: Uint8Array): WebhookBusPayload {
  return JSON.parse(new TextDecoder().decode(bytes)) as WebhookBusPayload;
}

export const GITHUB_WEBHOOKS_TOPIC = "github.webhooks";
