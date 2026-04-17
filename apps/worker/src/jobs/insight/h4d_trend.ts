import { systemPrompt, userPrompt } from "./prompts";
import type { AnthropicCompleter, H4aPrecomputed, InsightCandidate } from "./types";

/** H4d: weekly-delta narrative. What changed relative to last week. */
export async function runH4dTrend(
  pre: H4aPrecomputed,
  completer: AnthropicCompleter,
): Promise<InsightCandidate> {
  const raw = await completer.complete({
    system: systemPrompt(pre),
    user: userPrompt(
      "Describe the most important weekly delta — cost, efficiency, or adoption — in one sentence.",
      pre,
    ),
    cache_key: `h4d:${pre.org_id}:${pre.week}`,
  });
  return JSON.parse(raw) as InsightCandidate;
}
