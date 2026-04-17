import type { H4aPrecomputed } from "./types";

/**
 * H4a: Deterministic SQL pre-compute. Returns the valid-ID enums that
 * the four Haiku calls (H4b–H4e) must cite from. NO LLM in this step.
 *
 * In production this hits ClickHouse MVs (`dev_daily_rollup` etc.).
 * This ticket ships a fixture-driven stub; real SQL wires up when
 * D1-02 MVs are in main (#14) and H-AI's data source lands.
 */
export async function runH4aPrecompute(_orgId: string, _week: string): Promise<H4aPrecomputed> {
  return {
    org_id: _orgId,
    week: _week,
    engineer_ids: ["dev_a", "dev_b", "dev_c"],
    session_ids: ["sess_1", "sess_2", "sess_3"],
    cluster_ids: ["c_refactor", "c_bugfix"],
    aggregates: {
      total_cost_usd: 125.5,
      total_events: 4823,
      accepted_edits: 47,
    },
  };
}
