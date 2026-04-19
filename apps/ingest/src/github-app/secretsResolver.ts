// Per-installation webhook-secret resolver (PRD §11.5, D55).
//
// `github_installations.webhook_secret_active_ref` / `webhook_secret_previous_ref`
// hold POINTERS into the secrets store, not the bytes themselves. The resolver
// maps a ref → Buffer. For dev + tests we keep an in-process map keyed by ref;
// production swaps in a KMS-backed impl behind the same interface.
//
// The resolver is deliberately side-effect-free: callers decide how to handle
// a miss (404 vs 500 vs retry). A missing `active` ref at verification time is
// a boot-coherence failure, not a runtime rejection — the ingest boot check
// (G0 bootCheck.ts) already refuses to serve when `webhookSecretRef` is empty.
//
// Interface shape kept symmetric with `OrgPolicyStore` from ./tier/enforceTier
// so the dependency-injection seam (apps/ingest/src/deps.ts) adds cleanly.

export interface WebhookSecretResolver {
  /**
   * Resolve a single `*_ref` string to the secret bytes. Returns `null` when
   * the ref is unknown (never throws on miss — the router decides the HTTP
   * response).
   */
  resolve(ref: string): Promise<Buffer | null>;
}

/**
 * In-process resolver used by tests and the dev stack. The dev stack seeds
 * the well-known fixture secret ref via `seed(ref, bytes)`.
 */
export class InMemoryWebhookSecretResolver implements WebhookSecretResolver {
  private readonly map = new Map<string, Buffer>();

  seed(ref: string, secret: string | Buffer): void {
    const buf = typeof secret === "string" ? Buffer.from(secret, "utf8") : Buffer.from(secret);
    this.map.set(ref, buf);
  }

  forget(ref: string): void {
    this.map.delete(ref);
  }

  async resolve(ref: string): Promise<Buffer | null> {
    const b = this.map.get(ref);
    return b ? Buffer.from(b) : null;
  }
}

/**
 * Convenience factory for tests that want a preseeded resolver and a handle
 * to seed more entries.
 */
export function createInMemoryWebhookSecretResolver(
  entries: Record<string, string> = {},
): InMemoryWebhookSecretResolver {
  const r = new InMemoryWebhookSecretResolver();
  for (const [ref, value] of Object.entries(entries)) r.seed(ref, value);
  return r;
}
