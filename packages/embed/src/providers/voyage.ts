import { now, postJson } from "../http";
import type { EmbedProvider, EmbedRequest, EmbedResult, ProviderHealth } from "../types";

/**
 * Voyage-3 premium provider; code-trained embeddings.
 * 1024-dim. BYO `VOYAGE_API_KEY`.
 */
interface VoyageOpts {
  apiKey: string;
  baseUrl?: string; // default https://api.voyageai.com/v1
  timeoutMs?: number;
}

interface VoyageEmbeddingResponse {
  object: string;
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { total_tokens: number };
}

export class VoyageEmbedder implements EmbedProvider {
  readonly id = "voyage" as const;
  readonly model = "voyage-3";
  readonly dim = 1024;
  readonly maxBatch = 128;
  readonly maxInputTokens = 32_000;
  readonly costPerMillionTokens = 0.06; // approx; BYO key mode

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: VoyageOpts) {
    if (!opts.apiKey) throw new Error("VoyageEmbedder requires apiKey");
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? "https://api.voyageai.com/v1";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async embed(req: EmbedRequest): Promise<EmbedResult> {
    const [first] = await this.embedBatch([req]);
    if (!first) throw new Error("VoyageEmbedder: empty embedBatch result");
    return first;
  }

  async embedBatch(reqs: EmbedRequest[]): Promise<EmbedResult[]> {
    if (reqs.length === 0) return [];
    if (reqs.length > this.maxBatch) {
      throw new Error(`VoyageEmbedder: batch of ${reqs.length} exceeds maxBatch ${this.maxBatch}`);
    }
    const started = now();
    const body = await postJson<VoyageEmbeddingResponse>({
      url: `${this.baseUrl}/embeddings`,
      body: { model: this.model, input: reqs.map((r) => r.text) },
      headers: { authorization: `Bearer ${this.apiKey}` },
      timeoutMs: this.timeoutMs,
    });
    const latency = now() - started;
    // Voyage response order may differ; sort by `.index` to match input order.
    const rows = [...body.data].sort((a, b) => a.index - b.index);
    if (rows.length !== reqs.length) {
      throw new Error(`VoyageEmbedder: response length ${rows.length} != request ${reqs.length}`);
    }
    return rows.map((row) => {
      if (row.embedding.length !== this.dim) {
        throw new Error(
          `VoyageEmbedder: vector dim ${row.embedding.length} != declared ${this.dim}`,
        );
      }
      return {
        vector: Float32Array.from(row.embedding),
        provider: this.id,
        model: body.model,
        dim: this.dim,
        cached: false,
        latency_ms: latency,
      };
    });
  }

  async health(): Promise<ProviderHealth> {
    try {
      await this.embed({ text: ".", purpose: "ad-hoc" });
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
}
