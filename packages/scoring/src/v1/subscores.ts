/**
 * Raw subscores — Sprint-1 stub.
 *
 * Sprint-2 replaces with the full `ai_leverage_v1` formulas per
 * `dev-docs/PRD.md` §7.1 (and h-scoring-prd §7 Step 1).
 *
 * For now every subscore except Efficiency returns 50 (a neutral placeholder
 * chosen so v0 output is obviously synthetic — a real number would be
 * misleading before the math lands). Efficiency uses the only formula that
 * can be computed honestly from the two signals available at Sprint 1:
 * `accepted_edits / cost_usd * 10`, clamped to [0, 100], with a local-model
 * fallback to 50 when `cost_usd = 0` (D12 Rule 4 — no `∞`, no `NaN`).
 */

import type { ScoringInput } from "../index";

export interface RawSubscores {
  outcome_quality: number;
  efficiency: number;
  autonomy: number;
  adoption_depth: number;
  team_impact: number;
}

/**
 * Sprint-1 stub. TODO(Sprint-2): replace with the locked formulas from
 * `dev-docs/PRD.md` §7.1 (outcome_raw, efficiency_raw, autonomy_raw,
 * adoption_raw, teamImpact_raw).
 */
export function computeRawSubscores(signals: ScoringInput["signals"]): RawSubscores {
  let efficiency: number;
  if (signals.cost_usd > 0) {
    efficiency = Math.min(100, Math.max(0, (signals.accepted_edits / signals.cost_usd) * 10));
  } else {
    // Local-model fallback — D12 Rule 4. No ∞, no NaN. Neutral placeholder
    // until Sprint-2 `accepted_edits_per_active_hour` fallback lands.
    efficiency = 50;
  }

  return {
    outcome_quality: 50,
    efficiency,
    autonomy: 50,
    adoption_depth: 50,
    team_impact: 50,
  };
}
