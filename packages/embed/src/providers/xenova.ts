import { now } from "../http";
import type { EmbedProvider, EmbedRequest, EmbedResult, ProviderHealth } from "../types";

/**
 * Bundled `@xenova/transformers` MiniLM-L6 @ 384d.
 * Last-resort air-gapped fallback. Lazy-loads the 22MB model on first use.
 */
interface XenovaOpts {
  model?: string; // default Xenova/all-MiniLM-L6-v2
}

// Opaque handle to the lazily-loaded pipeline function. We don't pull the
// type from @xenova/transformers here because this file is loaded in
// resolver-probing paths where the dep may not be installed yet.
type XenovaPipeline = (
  text: string | string[],
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>;

let cachedPipeline: XenovaPipeline | null = null;
let loadError: Error | null = null;

async function getPipeline(modelId: string): Promise<XenovaPipeline> {
  if (cachedPipeline) return cachedPipeline;
  if (loadError) throw loadError;
  try {
    // Dynamic import keeps the dep optional — callers who never hit Xenova don't pay.
    // String-wrapped so tsc doesn't try to resolve the module at typecheck time.
    // @xenova/transformers is a heavy optional runtime dep, not a devDep.
    const modName = "@xenova/transformers";
    const mod = (await import(modName)) as unknown as {
      pipeline: (task: string, model: string) => Promise<XenovaPipeline>;
    };
    cachedPipeline = await mod.pipeline("feature-extraction", modelId);
    return cachedPipeline;
  } catch (err) {
    loadError = err instanceof Error ? err : new Error(String(err));
    throw loadError;
  }
}

export class XenovaEmbedder implements EmbedProvider {
  readonly id = "xenova" as const;
  readonly model: string;
  readonly dim = 384;
  readonly maxBatch = 32;
  readonly maxInputTokens = 512;
  readonly costPerMillionTokens = 0;

  constructor(opts: XenovaOpts = {}) {
    this.model = opts.model ?? "Xenova/all-MiniLM-L6-v2";
  }

  async embed(req: EmbedRequest): Promise<EmbedResult> {
    const started = now();
    const pipe = await getPipeline(this.model);
    const out = await pipe(req.text, { pooling: "mean", normalize: true });
    if (out.data.length !== this.dim) {
      throw new Error(`XenovaEmbedder: vector dim ${out.data.length} != declared ${this.dim}`);
    }
    return {
      vector: out.data,
      provider: this.id,
      model: this.model,
      dim: this.dim,
      cached: false,
      latency_ms: now() - started,
    };
  }

  async embedBatch(reqs: EmbedRequest[]): Promise<EmbedResult[]> {
    if (reqs.length === 0) return [];
    if (reqs.length > this.maxBatch) {
      throw new Error(`XenovaEmbedder: batch of ${reqs.length} exceeds maxBatch ${this.maxBatch}`);
    }
    const started = now();
    const pipe = await getPipeline(this.model);
    const out = await pipe(
      reqs.map((r) => r.text),
      { pooling: "mean", normalize: true },
    );
    const latency = now() - started;
    const total = out.data.length;
    if (total !== reqs.length * this.dim) {
      throw new Error(`XenovaEmbedder: flat tensor len ${total} != ${reqs.length}×${this.dim}`);
    }
    return reqs.map((_, i) => ({
      vector: out.data.slice(i * this.dim, (i + 1) * this.dim),
      provider: this.id,
      model: this.model,
      dim: this.dim,
      cached: false,
      latency_ms: latency,
    }));
  }

  async health(): Promise<ProviderHealth> {
    try {
      await getPipeline(this.model);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
}
