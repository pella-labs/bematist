import { systemPrompt, userPrompt } from "./prompts";
import type { AnthropicCompleter, H4aPrecomputed, InsightCandidate } from "./types";

/** H4c: cohort-pattern call. Surfaces consistent patterns within cohorts. */
export async function runH4cCohort(
  pre: H4aPrecomputed,
  completer: AnthropicCompleter,
): Promise<InsightCandidate> {
  const raw = await completer.complete({
    system: systemPrompt(pre),
    user: userPrompt(
      "Identify consistent cohort-level patterns — e.g. 'refactor cluster users are 30% more efficient'.",
      pre,
    ),
    cache_key: `h4c:${pre.org_id}:${pre.week}`,
  });
  return JSON.parse(raw) as InsightCandidate;
}
