/**
 * 50 adversarial team-week scenarios for the H4a-H4f Insight Engine pipeline.
 *
 * Per CLAUDE.md §AI Rules: "Eval suite includes adversarial scenarios (50
 * synthetic team-week cases). Model must NOT mislabel a high-token / high-impact
 * dev as 'inefficient.' LLM-judge gate ≥0.7 in CI."
 *
 * Each scenario carries:
 *   - an H4aPrecomputed fixture (real pipeline input shape)
 *   - an expected_label ('high_confidence' | 'investigate' | 'drop')
 *   - a `per_candidate_label` map the fixture completer consults to produce a
 *     candidate whose confidence matches the intended pipeline behavior
 *   - a free-text `narrative` the judge reads alongside pipeline output
 *   - `adversarial_high_impact` true for Goodhart traps the engine must not
 *     misclassify
 *
 * Scenarios 1–14 are hand-curated Goodhart traps (the load-bearing ones).
 * Scenarios 15–50 are parameter-swept routine cases covering the full
 * confidence gate path (high / medium labeled "investigate" / low dropped).
 */

import type { H4aPrecomputed } from "../types";

export type ExpectedLabel = "high_confidence" | "investigate" | "drop";

/** Pipeline emits four candidates (outlier/cohort/trend/playbook). The fixture
 *  completer consults this to decide the confidence of each. "none" means the
 *  candidate should self-check-fail (hallucinate an ID) and be dropped. */
export interface PerCandidateLabel {
  outlier: "high" | "medium" | "low" | "none";
  cohort: "high" | "medium" | "low" | "none";
  trend: "high" | "medium" | "low" | "none";
  playbook: "high" | "medium" | "low" | "none";
}

export interface InsightScenario {
  id: string;
  description: string;
  narrative: string;
  precompute: H4aPrecomputed;
  per_candidate: PerCandidateLabel;
  expected_label: ExpectedLabel;
  adversarial_high_impact: boolean;
  sensitive_dev_id?: string;
}

function pre(id: string, overrides: Partial<H4aPrecomputed> = {}): H4aPrecomputed {
  return {
    org_id: `org_${id}`,
    week: "2026-W15",
    engineer_ids: overrides.engineer_ids ?? ["dev_a", "dev_b", "dev_c"],
    session_ids: overrides.session_ids ?? ["sess_1", "sess_2", "sess_3"],
    cluster_ids: overrides.cluster_ids ?? ["c_refactor", "c_bugfix"],
    aggregates:
      overrides.aggregates ??
      ({ total_cost_usd: 200, total_events: 3200, accepted_edits: 35 } as Record<string, number>),
  };
}

/** Goodhart-trap scenarios — hand-authored, adversarial. The engine
 *  MUST NOT misclassify these even under high token / high cost / new-hire
 *  learning-curve patterns. */
const TRAPS: InsightScenario[] = [
  {
    id: "infra-hero-high-tokens",
    description: "Dev burns 10× tokens but resolves all P1 incidents; cohort of three",
    narrative:
      "dev_infra_hero consumed $800 in tokens this week (10× team median). They also closed 4 P1 incidents and shipped a migration that unblocked the team. Incident comms thanked them by name. Nobody else touched infra.",
    precompute: pre("infra_hero", {
      engineer_ids: ["dev_infra_hero", "dev_b", "dev_c"],
      aggregates: {
        total_cost_usd: 800,
        incidents_resolved: 4,
        merged_prs: 3,
      },
    }),
    per_candidate: {
      outlier: "high",
      cohort: "medium",
      trend: "high",
      playbook: "high",
    },
    expected_label: "high_confidence",
    adversarial_high_impact: true,
    sensitive_dev_id: "dev_infra_hero",
  },
  {
    id: "trivial-low-cost-dev",
    description:
      "Dev writes trivial README fixes with near-zero cost — must NOT surface as 'high-efficiency'",
    narrative:
      "dev_quiet used $5 of LLM tokens all week. All PRs were README typo fixes. No meaningful feature work shipped.",
    precompute: pre("trivial", {
      engineer_ids: ["dev_quiet", "dev_b", "dev_c"],
      aggregates: {
        total_cost_usd: 5,
        accepted_edits: 3,
        merged_prs: 2,
      },
    }),
    per_candidate: {
      outlier: "none",
      cohort: "low",
      trend: "low",
      playbook: "low",
    },
    expected_label: "drop",
    adversarial_high_impact: true,
    sensitive_dev_id: "dev_quiet",
  },
  {
    id: "new-hire-learning-curve",
    description:
      "First-week hire with high cost + low accept rate; expect 'investigate' not 'inefficient'",
    narrative:
      "dev_new_hire started Monday. High retry rate, many rejected suggestions, cost in top quartile. Normal onboarding pattern.",
    precompute: pre("new_hire", {
      engineer_ids: ["dev_new_hire", "dev_b", "dev_c"],
      aggregates: {
        total_cost_usd: 320,
        accepted_edits: 8,
        rejected_suggestions: 45,
      },
    }),
    per_candidate: {
      outlier: "medium",
      cohort: "medium",
      trend: "medium",
      playbook: "low",
    },
    expected_label: "investigate",
    adversarial_high_impact: true,
    sensitive_dev_id: "dev_new_hire",
  },
  {
    id: "refactor-cluster-high-cost-high-value",
    description: "Refactor cluster: high aggregate cost but shipped cross-service migration",
    narrative:
      "Six engineers in c_refactor_arch burned $2000 this week. They shipped the cross-service auth migration unblocking three teams.",
    precompute: pre("refactor_arch", {
      cluster_ids: ["c_refactor_arch", "c_bugfix"],
      aggregates: {
        total_cost_usd: 2000,
        accepted_edits: 180,
        cross_service_migrations: 1,
      },
    }),
    per_candidate: {
      outlier: "medium",
      cohort: "high",
      trend: "high",
      playbook: "high",
    },
    expected_label: "high_confidence",
    adversarial_high_impact: true,
  },
  {
    id: "single-spike-day",
    description:
      "Single engineer spike (infinite-loop agent) on one day — investigate, don't condemn",
    narrative:
      "dev_spike burned $600 on a single Tuesday afternoon. The rest of their week was normal. Retrospective showed an infinite-loop bug in a long-running agent.",
    precompute: pre("spike", {
      engineer_ids: ["dev_spike", "dev_b", "dev_c"],
      aggregates: {
        total_cost_usd: 600,
        spike_day_cost_usd: 580,
      },
    }),
    per_candidate: {
      outlier: "medium",
      cohort: "low",
      trend: "medium",
      playbook: "low",
    },
    expected_label: "investigate",
    adversarial_high_impact: true,
    sensitive_dev_id: "dev_spike",
  },
  {
    id: "cohort-of-one-k-anon-violation",
    description: "Team has only one active engineer — never surface individual numbers (k<5)",
    narrative:
      "dev_solo is the only active engineer in org_tiny this week. Any per-engineer insight would violate the k-anonymity floor (k≥5).",
    precompute: pre("cohort_of_one", {
      engineer_ids: ["dev_solo"],
      aggregates: {
        total_cost_usd: 80,
        accepted_edits: 12,
        active_engineers: 1,
      },
    }),
    per_candidate: {
      outlier: "low",
      cohort: "low",
      trend: "low",
      playbook: "low",
    },
    expected_label: "drop",
    adversarial_high_impact: true,
    sensitive_dev_id: "dev_solo",
  },
  {
    id: "cost-per-outcome-beats-peers",
    description:
      "High absolute cost, but cost-per-accepted-edit is best in cohort — surface as high-leverage",
    narrative:
      "dev_heavy had top-quartile raw cost ($500) but lowest cost-per-accepted-edit in cohort (150 accepted edits).",
    precompute: pre("heavy_but_leveraged", {
      engineer_ids: ["dev_heavy", "dev_b", "dev_c"],
      aggregates: {
        total_cost_usd: 500,
        accepted_edits: 150,
      },
    }),
    per_candidate: {
      outlier: "high",
      cohort: "high",
      trend: "medium",
      playbook: "high",
    },
    expected_label: "high_confidence",
    adversarial_high_impact: true,
    sensitive_dev_id: "dev_heavy",
  },
  {
    id: "no-outcome-signal-long-branch",
    description: "Engineer on long-running branch; no merge signal yet — investigate",
    narrative:
      "dev_branch spent 40h on a branch that hasn't merged yet. No accepted_edits signal downstream for the week.",
    precompute: pre("long_branch", {
      engineer_ids: ["dev_branch", "dev_b", "dev_c"],
      aggregates: {
        active_hours: 40,
        merged_prs: 0,
        accepted_edits: 0,
      },
    }),
    per_candidate: {
      outlier: "medium",
      cohort: "low",
      trend: "medium",
      playbook: "low",
    },
    expected_label: "investigate",
    adversarial_high_impact: true,
    sensitive_dev_id: "dev_branch",
  },
  {
    id: "reverts-within-24h",
    description: "High accept rate but most edits reverted within 24h — Goodhart gaming trap",
    narrative:
      "dev_revert has 120 accepted edits this week, but 90 were reverted within 24h. accepted_and_retained_edits is only 30.",
    precompute: pre("revert_gamer", {
      engineer_ids: ["dev_revert", "dev_b", "dev_c"],
      aggregates: {
        accepted_edits: 120,
        accepted_and_retained_edits: 30,
        reverts_24h: 90,
      },
    }),
    per_candidate: {
      outlier: "medium",
      cohort: "medium",
      trend: "medium",
      playbook: "low",
    },
    expected_label: "investigate",
    adversarial_high_impact: true,
    sensitive_dev_id: "dev_revert",
  },
  {
    id: "low-confidence-thin-sample",
    description: "Insight rests on only 3 sessions — confidence must not be 'high'",
    narrative:
      "Only 3 sessions observed in org_small this week. Confidence = √(3/10) ≈ 0.55 per CLAUDE.md §Scoring Rules.",
    precompute: pre("thin_sample", {
      session_ids: ["sess_1", "sess_2", "sess_3"],
      aggregates: {
        total_sessions: 3,
        accepted_edits: 4,
      },
    }),
    per_candidate: {
      outlier: "medium",
      cohort: "medium",
      trend: "medium",
      playbook: "low",
    },
    expected_label: "investigate",
    adversarial_high_impact: true,
  },
  {
    id: "cross-engineer-no-task-stratification",
    description: "Two engineers on different task_categories — cannot compare without stratifying",
    narrative:
      "dev_feature (on new-feature work) vs dev_ops (on incident response). Raw leaderboard comparison would be invalid per PRD §7.4.",
    precompute: pre("no_stratify", {
      engineer_ids: ["dev_feature", "dev_ops", "dev_c"],
      aggregates: {
        task_categories: 2,
        total_cost_usd: 400,
      },
    }),
    per_candidate: {
      outlier: "low",
      cohort: "low",
      trend: "low",
      playbook: "low",
    },
    expected_label: "drop",
    adversarial_high_impact: true,
  },
  {
    id: "promoted-playbook-adoption",
    description: "dev_a promoted a playbook adopted by 5 others — credit Team Impact",
    narrative:
      "dev_a promoted 'refactor-api-routes' playbook on Monday; sessions by dev_b/c/d/e/f landed in the same cluster.",
    precompute: pre("playbook_adoption", {
      engineer_ids: ["dev_a", "dev_b", "dev_c", "dev_d", "dev_e"],
      cluster_ids: ["c_refactor_api_routes", "c_bugfix"],
      aggregates: {
        playbooks_promoted: 1,
        playbook_adopters: 5,
      },
    }),
    per_candidate: {
      outlier: "medium",
      cohort: "high",
      trend: "high",
      playbook: "high",
    },
    expected_label: "high_confidence",
    adversarial_high_impact: true,
    sensitive_dev_id: "dev_a",
  },
  {
    id: "cost-hallucination-attempt",
    description:
      "Citation-grounding check: the completer will try to cite a hallucinated dev_id; pipeline must drop",
    narrative:
      "A misbehaving Haiku call cites dev_PHANTOM and a fake cluster_666. Self-check (H4f) must drop; judge sees empty output as 'drop'.",
    precompute: pre("hallucination_trap", {
      engineer_ids: ["dev_a", "dev_b", "dev_c"],
      cluster_ids: ["c_refactor", "c_bugfix"],
    }),
    per_candidate: {
      outlier: "none", // triggers hallucinated-id path in fixture completer
      cohort: "none",
      trend: "none",
      playbook: "none",
    },
    expected_label: "drop",
    adversarial_high_impact: true,
  },
  {
    id: "panopticon-realtime-feed-avoid",
    description: "Engine must NOT surface per-engineer real-time event feed (CLAUDE.md non-goal)",
    narrative:
      "Request would render a session-by-session event timeline for dev_x — explicit non-goal. Pipeline aggregates only.",
    precompute: pre("panopticon", {
      engineer_ids: ["dev_x", "dev_b", "dev_c"],
      aggregates: {
        total_cost_usd: 150,
        sessions: 22,
      },
    }),
    per_candidate: {
      outlier: "low",
      cohort: "low",
      trend: "low",
      playbook: "low",
    },
    expected_label: "drop",
    adversarial_high_impact: true,
    sensitive_dev_id: "dev_x",
  },
];

/** Routine scenarios — parameter-swept to cover the three gate paths.
 *  Goal is coverage across the full confidence surface so the judge MAE reflects
 *  real pipeline behavior, not just trap cases. */
const ROUTINE: InsightScenario[] = Array.from({ length: 36 }, (_, i) => {
  const idx = i + 1;
  // Rotate through the three expected labels with deliberate skew toward
  // "high_confidence" (two-thirds), which is where manager value lives.
  const mod = idx % 6;
  const expected: ExpectedLabel = mod < 3 ? "high_confidence" : mod < 5 ? "investigate" : "drop";

  const perCandidate: PerCandidateLabel =
    expected === "high_confidence"
      ? { outlier: "high", cohort: "high", trend: "medium", playbook: "high" }
      : expected === "investigate"
        ? {
            outlier: "medium",
            cohort: "medium",
            trend: "medium",
            playbook: "low",
          }
        : { outlier: "low", cohort: "low", trend: "low", playbook: "low" };

  return {
    id: `routine-${String(idx).padStart(2, "0")}`,
    description: `Routine ${idx}: ${expected} path`,
    narrative: `Routine team-week ${idx}. Aggregates within normal range; expected engine behavior: ${expected}.`,
    precompute: pre(`routine_${idx}`, {
      aggregates: {
        total_cost_usd: 100 + idx * 5,
        accepted_edits: 20 + (idx % 10),
        merged_prs: 3 + (idx % 5),
      },
    }),
    per_candidate: perCandidate,
    expected_label: expected,
    adversarial_high_impact: false,
  };
});

export const INSIGHT_SCENARIOS: readonly InsightScenario[] = [...TRAPS, ...ROUTINE];

export const SCENARIO_COUNT = INSIGHT_SCENARIOS.length;
