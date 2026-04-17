/**
 * `ai_leverage_v1` entry — Sprint-1 v0 stub.
 *
 * Returns a fully-shaped `ScoringOutput` so `apps/web` (Workstream E) can
 * render a tile without errors at M1. All values except `efficiency` are
 * placeholders. The Sprint-2 commit that replaces this is a pure-math diff
 * and must pass the 500-case eval gate (`bun run test:scoring`).
 *
 * @see ../../../../dev-docs/workstreams/h-scoring-prd.md §12.2
 */

import { createHash } from "node:crypto";
import type { ScoringInput, ScoringOutput } from "../index";
import { computeRawSubscores } from "./subscores";

/**
 * Deterministic sha256 of a `ScoringInput`. Keys sorted so replayed inputs hash
 * identically regardless of construction order.
 */
function sha256OfInput(input: ScoringInput): string {
  const canonical = JSON.stringify(input, Object.keys(input).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

export function score(input: ScoringInput): ScoringOutput {
  if (input.metric_version !== "ai_leverage_v1") {
    throw new Error(`Unknown metric_version: ${input.metric_version as string}`);
  }

  const raw = computeRawSubscores(input.signals);

  // Sprint-1 stub composite: use the efficiency subscore as the face value so
  // the `cost_usd > 0` case produces a meaningful (if rough) number. Sprint-2
  // replaces this with the full 5-step `ai_leverage_v1` pipeline.
  const rawALS = Math.round(raw.efficiency);

  return {
    metric_version: "ai_leverage_v1",
    scope: input.scope,
    scope_id: input.scope_id,
    window: input.window,
    ai_leverage_score: rawALS,
    raw_ai_leverage: rawALS,
    confidence: 1.0,
    subscores: {
      outcome_quality: raw.outcome_quality,
      efficiency: raw.efficiency,
      autonomy: raw.autonomy,
      adoption_depth: raw.adoption_depth,
      team_impact: raw.team_impact,
    },
    display: {
      show: true,
      failed_gates: [],
      raw_subscores_available: false,
    },
    pricing_version_drift: false,
    inputs_hash: sha256OfInput(input),
  };
}
