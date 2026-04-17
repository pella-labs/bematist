/**
 * Resolver chain per contract 05 §Default chain.
 *
 * Order:
 *   1. `EMBEDDING_PROVIDER` env var override (if set AND reachable).
 *   2. `openai` with `OPENAI_API_KEY`.
 *   3. `voyage` with `VOYAGE_API_KEY` (opt-in).
 *   4. `ollama-nomic` if localhost:11434 reachable.
 *   5. `xenova` (bundled last-resort).
 *
 * Air-gapped mode (`BEMATIST_AIR_GAPPED=1`) removes (2) and (3) from
 * consideration regardless of env — cloud providers are refused.
 */

import { OllamaEmbedder } from "./providers/ollama";
import { OpenAIEmbedder } from "./providers/openai";
import { VoyageEmbedder } from "./providers/voyage";
import { XenovaEmbedder } from "./providers/xenova";
import { type EmbedProvider, NoEmbedProviderError, type ProviderId } from "./types";

export interface ResolveOpts {
  /** Override the provider chain. Honored before health probes. */
  override?: ProviderId;
  /** Refuse cloud providers. Defaults to BEMATIST_AIR_GAPPED env var. */
  airGapped?: boolean;
  /** Env var snapshot; defaults to process.env. Tests inject. */
  env?: Record<string, string | undefined>;
  /** Skip health probes (faster; tests sometimes want raw construct). */
  skipHealth?: boolean;
}

const CLOUD_PROVIDERS: readonly ProviderId[] = ["openai", "voyage"];

function isCloud(id: ProviderId): boolean {
  return CLOUD_PROVIDERS.includes(id);
}

function buildProvider(
  id: ProviderId,
  env: Record<string, string | undefined>,
): EmbedProvider | null {
  switch (id) {
    case "openai": {
      const apiKey = env.OPENAI_API_KEY;
      if (!apiKey) return null;
      return new OpenAIEmbedder({ apiKey });
    }
    case "voyage": {
      const apiKey = env.VOYAGE_API_KEY;
      if (!apiKey) return null;
      return new VoyageEmbedder({ apiKey });
    }
    case "ollama-nomic":
      return new OllamaEmbedder({
        baseUrl: env.OLLAMA_URL ?? "http://localhost:11434",
      });
    case "xenova":
      return new XenovaEmbedder();
  }
}

export async function resolveProvider(opts: ResolveOpts = {}): Promise<EmbedProvider> {
  const env = opts.env ?? (process.env as Record<string, string | undefined>);
  const airGapped = opts.airGapped ?? env.BEMATIST_AIR_GAPPED === "1";

  // Build the ordered candidate list.
  const override = opts.override ?? (env.EMBEDDING_PROVIDER as ProviderId | undefined);
  const defaultChain: ProviderId[] = ["openai", "voyage", "ollama-nomic", "xenova"];
  const chain: ProviderId[] = override
    ? [override, ...defaultChain.filter((p) => p !== override)]
    : defaultChain;

  const tried: ProviderId[] = [];
  for (const id of chain) {
    if (airGapped && isCloud(id)) {
      continue; // air-gapped mode refuses cloud providers entirely
    }
    const p = buildProvider(id, env);
    if (!p) {
      tried.push(id);
      continue;
    }
    if (opts.skipHealth) return p;
    const health = await p.health();
    if (health.ok) return p;
    tried.push(id);
  }
  throw new NoEmbedProviderError(tried);
}
