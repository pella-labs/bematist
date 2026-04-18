import { systemPrompt, userPrompt } from "./prompts";
import type { AnthropicCompleter, H4aPrecomputed, InsightCandidate } from "./types";

/** H4b: cost-outlier call. Looks for high-cost + low-outcome engineers. */
export async function runH4bOutlier(
  pre: H4aPrecomputed,
  completer: AnthropicCompleter,
): Promise<InsightCandidate> {
  const raw = await completer.complete({
    system: systemPrompt(pre),
    user: userPrompt(
      "Identify cost outliers — engineers whose cost is top-10% AND accepted edits are bottom-10%.",
      pre,
    ),
    cache_key: `h4b:${pre.org_id}:${pre.week}`,
  });
  return JSON.parse(raw) as InsightCandidate;
}
