import { systemPrompt, userPrompt } from "./prompts";
import type { AnthropicCompleter, H4aPrecomputed, InsightCandidate } from "./types";

/** H4e: recent Promote-to-Playbook candidates (D31 Team Impact signal). */
export async function runH4ePlaybook(
  pre: H4aPrecomputed,
  completer: AnthropicCompleter,
): Promise<InsightCandidate> {
  const raw = await completer.complete({
    system: systemPrompt(pre),
    user: userPrompt(
      "Surface recent Promote-to-Playbook candidates — sessions that solved a common workflow in the top 10% of accepted edits per dollar.",
      pre,
    ),
    cache_key: `h4e:${pre.org_id}:${pre.week}`,
  });
  return JSON.parse(raw) as InsightCandidate;
}
