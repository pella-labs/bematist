import { now, postJson } from "../http";
import type { EmbedProvider, EmbedRequest, EmbedResult, ProviderHealth } from "../types";

/**
 * OpenAI `text-embedding-3-small` @ 512 dims (Matryoshka-truncated).
 * Default on managed cloud; BYO `OPENAI_API_KEY` on self-host.
 * Per CLAUDE.md Tech Stack.
 */
interface OpenAIOpts {
  apiKey: string;
  dim?: number; // default 512
  baseUrl?: string; // default https://api.openai.com/v1
  timeoutMs?: number;
}

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

export class OpenAIEmbedder implements EmbedProvider {
  readonly id = "openai" as const;
  readonly model = "text-embedding-3-small";
  readonly dim: number;
  readonly maxBatch = 2048;
  readonly maxInputTokens = 8192;
  readonly costPerMillionTokens = 0.02; // $0.02 / 1M tokens at time of writing

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: OpenAIOpts) {
    if (!opts.apiKey) throw new Error("OpenAIEmbedder requires apiKey");
    this.apiKey = opts.apiKey;
    this.dim = opts.dim ?? 512;
    this.baseUrl = opts.baseUrl ?? "https://api.openai.com/v1";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async embed(req: EmbedRequest): Promise<EmbedResult> {
    const [first] = await this.embedBatch([req]);
    if (!first) throw new Error("OpenAIEmbedder: empty embedBatch result");
    return first;
  }

  async embedBatch(reqs: EmbedRequest[]): Promise<EmbedResult[]> {
    if (reqs.length === 0) return [];
    if (reqs.length > this.maxBatch) {
      throw new Error(`OpenAIEmbedder: batch of ${reqs.length} exceeds maxBatch ${this.maxBatch}`);
    }
    const started = now();
    const payload = {
      model: this.model,
      input: reqs.map((r) => r.text),
      dimensions: this.dim,
    };
    const body = await postJson<OpenAIEmbeddingResponse>({
      url: `${this.baseUrl}/embeddings`,
      body: payload,
      headers: { authorization: `Bearer ${this.apiKey}` },
      timeoutMs: this.timeoutMs,
    });
    const latency = now() - started;
    if (body.data.length !== reqs.length) {
      throw new Error(
        `OpenAIEmbedder: response length ${body.data.length} != request ${reqs.length}`,
      );
    }
    return body.data.map((row) => {
      const vec = row.embedding;
      if (vec.length !== this.dim) {
        throw new Error(`OpenAIEmbedder: vector dim ${vec.length} != declared ${this.dim}`);
      }
      return {
        vector: Float32Array.from(vec),
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
      // A single 1-token embed acts as a cheap liveness check.
      await this.embed({ text: ".", purpose: "ad-hoc" });
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
}
