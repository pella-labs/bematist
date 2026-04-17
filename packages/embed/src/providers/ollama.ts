import { now, postJson } from "../http";
import type { EmbedProvider, EmbedRequest, EmbedResult, ProviderHealth } from "../types";

/**
 * Ollama local provider — `nomic-embed-text` @ 768d.
 * Air-gapped fallback. No API key. Reaches `http://localhost:11434` by default.
 */
interface OllamaOpts {
  baseUrl?: string; // default http://localhost:11434
  model?: string; // default nomic-embed-text
  timeoutMs?: number;
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

export class OllamaEmbedder implements EmbedProvider {
  readonly id = "ollama-nomic" as const;
  readonly model: string;
  readonly dim = 768;
  readonly maxBatch = 1; // Ollama /api/embeddings is single-input; batch emulated sequentially
  readonly maxInputTokens = 8192;
  readonly costPerMillionTokens = 0; // local

  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: OllamaOpts = {}) {
    this.baseUrl = opts.baseUrl ?? "http://localhost:11434";
    this.model = opts.model ?? "nomic-embed-text";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async embed(req: EmbedRequest): Promise<EmbedResult> {
    const started = now();
    const body = await postJson<OllamaEmbeddingResponse>({
      url: `${this.baseUrl}/api/embeddings`,
      body: { model: this.model, prompt: req.text },
      timeoutMs: this.timeoutMs,
    });
    const vec = body.embedding;
    if (vec.length !== this.dim) {
      throw new Error(`OllamaEmbedder: vector dim ${vec.length} != declared ${this.dim}`);
    }
    return {
      vector: Float32Array.from(vec),
      provider: this.id,
      model: this.model,
      dim: this.dim,
      cached: false,
      latency_ms: now() - started,
    };
  }

  async embedBatch(reqs: EmbedRequest[]): Promise<EmbedResult[]> {
    // Ollama's HTTP API is single-prompt; run sequentially. Concurrency upgrade is a D2-05 concern.
    const results: EmbedResult[] = [];
    for (const r of reqs) {
      results.push(await this.embed(r));
    }
    return results;
  }

  async health(): Promise<ProviderHealth> {
    try {
      // /api/tags is cheap and doesn't run a model.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      try {
        const res = await fetch(`${this.baseUrl}/api/tags`, { signal: controller.signal });
        return res.ok ? { ok: true } : { ok: false, reason: `status ${res.status}` };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
}
