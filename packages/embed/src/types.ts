/**
 * Embed provider abstraction. Contract 05 §Provider interface.
 *
 * Providers do NOT redact — inputs are already redacted + Clio-verified
 * before they reach this layer. If a provider receives raw PII, the bug
 * is upstream in Clio, not here.
 */

export type ProviderId = "openai" | "voyage" | "ollama-nomic" | "xenova";

export type EmbedPurpose = "prompt-cluster" | "twin-finder" | "ad-hoc";

export interface EmbedRequest {
  /** Pre-redacted, pre-abstracted text. */
  text: string;
  /** Caller hint; used for cache namespacing in D2-05 (not in this ticket). */
  purpose: EmbedPurpose;
}

export interface EmbedResult {
  /** Embedding vector in the dimension the provider declares. */
  vector: Float32Array;
  /** Provider id at call time. */
  provider: ProviderId;
  /** Model id at call time. */
  model: string;
  /** Dimension of `vector`. Must equal `provider.dim`. */
  dim: number;
  /** Whether this came from cache (wired in D2-05; false here). */
  cached: boolean;
  /** Wall-clock latency in ms. */
  latency_ms: number;
}

export interface ProviderHealth {
  ok: boolean;
  reason?: string;
}

export interface EmbedProvider {
  readonly id: ProviderId;
  readonly model: string;
  readonly dim: number;
  readonly maxBatch: number;
  readonly maxInputTokens: number;
  /** USD per 1M input tokens; null/undefined for local providers. */
  readonly costPerMillionTokens?: number;

  embed(req: EmbedRequest): Promise<EmbedResult>;
  embedBatch(reqs: EmbedRequest[]): Promise<EmbedResult[]>;
  /** Cheap reachability check. Used by the resolver fallback chain. */
  health(): Promise<ProviderHealth>;
}

/**
 * Thrown when no provider in the resolver chain is reachable or matches
 * the current air-gapped constraints. Callers should treat as fatal.
 */
export class NoEmbedProviderError extends Error {
  constructor(tried: ProviderId[]) {
    super(`no embed provider reachable (tried: ${tried.join(", ")})`);
    this.name = "NoEmbedProviderError";
  }
}
