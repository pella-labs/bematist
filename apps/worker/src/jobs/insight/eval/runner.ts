/**
 * Adversarial-eval runner — orchestrates the H4b–H4f phase files against
 * a per-scenario H4aPrecomputed, then calls the LLM-judge to score each
 * scenario's pipeline output against the expected confidence label.
 *
 * The orchestration mirrors `pipeline.ts` exactly (single retry on
 * self-check fail; high+medium kept; low dropped) so the eval validates
 * the actual gate behavior. We re-implement the orchestration here rather
 * than monkey-patching `runH4aPrecompute` so the scenario fixture flows
 * through deterministically — pipeline.ts and this file converge on the
 * same arithmetic via the keep/drop helper.
 */

import { runH4bOutlier } from "../h4b_outlier";
import { runH4cCohort } from "../h4c_cohort";
import { runH4dTrend } from "../h4d_trend";
import { runH4ePlaybook } from "../h4e_playbook";
import { validateCandidate } from "../h4f_self_check";
import type { AnthropicCompleter, H4aPrecomputed, InsightCandidate, InsightResult } from "../types";
import { fixtureCompleterForScenario } from "./completer";
import type { InsightScenario } from "./scenarios";
import { INSIGHT_SCENARIOS } from "./scenarios";

/** Identical signature + behavior to pipeline.ts's anonymous helper.
 *  Single retry on self-check failure → null on second failure. */
async function runWithSelfCheck(
  runner: (pre: H4aPrecomputed, completer: AnthropicCompleter) => Promise<InsightCandidate>,
  pre: H4aPrecomputed,
  completer: AnthropicCompleter,
): Promise<InsightCandidate | null> {
  const first = await runner(pre, completer);
  if (validateCandidate(first, pre).length === 0) return first;
  const second = await runner(pre, completer);
  if (validateCandidate(second, pre).length === 0) return second;
  return null;
}

/** Same confidence gate as pipeline.ts: drop low; keep high + medium. */
function keepForSurface(c: InsightCandidate): boolean {
  return c.confidence !== "low";
}

/** Run the H4b–H4f pipeline against a scenario's precompute + completer. */
export async function runScenario(
  scenario: InsightScenario,
  completer: AnthropicCompleter,
): Promise<InsightResult> {
  const pre = scenario.precompute;
  const settled = await Promise.all([
    runWithSelfCheck(runH4bOutlier, pre, completer),
    runWithSelfCheck(runH4cCohort, pre, completer),
    runWithSelfCheck(runH4dTrend, pre, completer),
    runWithSelfCheck(runH4ePlaybook, pre, completer),
  ]);

  let droppedLow = 0;
  const insights: InsightCandidate[] = [];
  for (const c of settled) {
    if (c === null) continue;
    if (!keepForSurface(c)) {
      droppedLow++;
      continue;
    }
    insights.push(c);
  }

  return {
    org_id: pre.org_id,
    week: pre.week,
    insights,
    dropped_low_confidence: droppedLow,
  };
}

// --- Judge-side --------------------------------------------------------------

export type JudgeVerdict = "pass" | "fail" | "ambiguous";
export type ExpectedLabel = "high_confidence" | "investigate" | "drop";

export interface JudgeInput {
  scenario: InsightScenario;
  pipeline_output: InsightResult;
  expected_label: ExpectedLabel;
}

export interface JudgeResponse {
  verdict: JudgeVerdict;
  reasoning: string;
}

export interface JudgeClient {
  score(input: JudgeInput): Promise<JudgeResponse>;
}

/** Map a pipeline result to the highest-severity confidence label observed.
 *  - any "high" candidate          → "high_confidence"
 *  - any "medium" candidate (and no "high") → "investigate"
 *  - empty                         → "drop"
 */
export function classifyPipelineOutput(out: InsightResult): ExpectedLabel {
  if (out.insights.length === 0) return "drop";
  if (out.insights.some((i) => i.confidence === "high")) return "high_confidence";
  if (out.insights.some((i) => i.confidence === "medium")) return "investigate";
  return "drop";
}

/** Deterministic mock judge — flat compare observed vs expected.
 *  CI runs against this; the real Opus judge wires in via env when present. */
export const mockJudge: JudgeClient = {
  async score({ scenario, pipeline_output, expected_label }): Promise<JudgeResponse> {
    const observed = classifyPipelineOutput(pipeline_output);
    if (observed === expected_label) {
      return {
        verdict: "pass",
        reasoning: `${scenario.id}: observed=${observed} matches expected=${expected_label}`,
      };
    }
    // Adversarial Goodhart traps that flip "high_confidence" into "drop"
    // (e.g., the engine wrongly dismisses a high-impact dev) are the most
    // expensive kind of miss — surface them as fail, not ambiguous.
    return {
      verdict: "fail",
      reasoning: `${scenario.id}: observed=${observed} != expected=${expected_label}`,
    };
  },
};

// --- Eval driver -------------------------------------------------------------

export interface EvalCaseResult {
  scenario_id: string;
  expected_label: ExpectedLabel;
  observed_label: ExpectedLabel;
  verdict: JudgeVerdict;
  reasoning: string;
  adversarial_high_impact: boolean;
  /** 1 = pass, 0 = fail, 0.5 = ambiguous. */
  score: number;
}

export interface EvalRun {
  results: EvalCaseResult[];
  total: number;
  passed: number;
  failed: number;
  ambiguous: number;
  /** Mean score across cases — 1.0 = perfect, 0.0 = all wrong. */
  mean_score: number;
  /** Mean absolute error against the all-pass target of 1.0. */
  mae: number;
  /** Pass rate restricted to adversarial high-impact traps (Goodhart cases). */
  adversarial_pass_rate: number;
  /** True iff `mae <= MAE_GATE` (= score ≥ 0.7). */
  passed_gate: boolean;
}

/** MERGE BLOCKER threshold per CLAUDE.md §AI Rules:
 *  "LLM-judge gate ≥ 0.7 in CI" → MAE ≤ 0.3 against all-pass. */
export const MAE_GATE = 0.3;

export interface RunEvalOpts {
  scenarios?: readonly InsightScenario[];
  judge?: JudgeClient;
}

export async function runAdversarialEval(opts: RunEvalOpts = {}): Promise<EvalRun> {
  const scenarios = opts.scenarios ?? INSIGHT_SCENARIOS;
  const judge = opts.judge ?? mockJudge;

  const results: EvalCaseResult[] = [];
  for (const scenario of scenarios) {
    const completer = fixtureCompleterForScenario(scenario);
    const out = await runScenario(scenario, completer);
    const observed = classifyPipelineOutput(out);
    const judged = await judge.score({
      scenario,
      pipeline_output: out,
      expected_label: scenario.expected_label,
    });
    results.push({
      scenario_id: scenario.id,
      expected_label: scenario.expected_label,
      observed_label: observed,
      verdict: judged.verdict,
      reasoning: judged.reasoning,
      adversarial_high_impact: scenario.adversarial_high_impact,
      score: verdictScore(judged.verdict),
    });
  }

  const total = results.length;
  const passed = results.filter((r) => r.verdict === "pass").length;
  const failed = results.filter((r) => r.verdict === "fail").length;
  const ambiguous = results.filter((r) => r.verdict === "ambiguous").length;
  const meanScore = total > 0 ? results.reduce((a, r) => a + r.score, 0) / total : 0;
  const mae = 1 - meanScore;

  const traps = results.filter((r) => r.adversarial_high_impact);
  const adversarialPassRate =
    traps.length > 0 ? traps.filter((r) => r.verdict === "pass").length / traps.length : 1;

  return {
    results,
    total,
    passed,
    failed,
    ambiguous,
    mean_score: meanScore,
    mae,
    adversarial_pass_rate: adversarialPassRate,
    passed_gate: mae <= MAE_GATE,
  };
}

function verdictScore(v: JudgeVerdict): number {
  switch (v) {
    case "pass":
      return 1;
    case "ambiguous":
      return 0.5;
    case "fail":
      return 0;
  }
}
