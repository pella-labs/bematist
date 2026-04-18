import { runH4aPrecompute } from "./h4a_precompute";
import { runH4bOutlier } from "./h4b_outlier";
import { runH4cCohort } from "./h4c_cohort";
import { runH4dTrend } from "./h4d_trend";
import { runH4ePlaybook } from "./h4e_playbook";
import { validateCandidate } from "./h4f_self_check";
import type { AnthropicCompleter, H4aPrecomputed, InsightCandidate, InsightResult } from "./types";

type CandidateRunner = (
  pre: H4aPrecomputed,
  completer: AnthropicCompleter,
) => Promise<InsightCandidate>;

const RUNNERS: CandidateRunner[] = [runH4bOutlier, runH4cCohort, runH4dTrend, runH4ePlaybook];

/**
 * Run one candidate with a single retry on self-check failure.
 * Returns the candidate if clean; null if both tries failed (DROP).
 */
async function runWithSelfCheck(
  runner: CandidateRunner,
  pre: H4aPrecomputed,
  completer: AnthropicCompleter,
): Promise<InsightCandidate | null> {
  const first = await runner(pre, completer);
  if (validateCandidate(first, pre).length === 0) return first;
  const second = await runner(pre, completer);
  if (validateCandidate(second, pre).length === 0) return second;
  return null;
}

/** Confidence gate per CLAUDE.md AI Rules. */
function keepForSurface(c: InsightCandidate): boolean {
  if (c.confidence === "low") return false; // dropped entirely
  return true; // high + medium shown; caller relabels medium as "investigate"
}

export interface RunInsightEngineOpts {
  org_id: string;
  week: string; // ISO week like "2026-W15"
  completer: AnthropicCompleter;
}

export async function runInsightEngine(opts: RunInsightEngineOpts): Promise<InsightResult> {
  const pre = await runH4aPrecompute(opts.org_id, opts.week);
  const settled = await Promise.all(RUNNERS.map((r) => runWithSelfCheck(r, pre, opts.completer)));

  let droppedLow = 0;
  const insights: InsightCandidate[] = [];
  for (const c of settled) {
    if (c === null) continue; // self-check dropped
    if (!keepForSurface(c)) {
      droppedLow++;
      continue;
    }
    insights.push(c);
  }

  return {
    org_id: opts.org_id,
    week: opts.week,
    insights,
    dropped_low_confidence: droppedLow,
  };
}
