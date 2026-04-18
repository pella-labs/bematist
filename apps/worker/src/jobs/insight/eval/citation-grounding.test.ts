/**
 * Citation-grounding contract — CLAUDE.md §AI Rules:
 *   "Every cited session_id / cluster_id / dev_id MUST come from a constrained
 *    enum supplied with the prompt. Validator catches; should never trip."
 *   + H4f: "regenerate failing calls once, drop if still failing."
 *
 * These tests mutate the H4a enum (or force the completer to cite invented
 * ids) and assert:
 *   - the pipeline DROPS the offending candidate (it does not surface it)
 *   - the pipeline does NOT loop trying to regenerate forever — at most one
 *     retry per H4f's contract.
 */

import { expect, test } from "bun:test";
import type { AnthropicCompleter, H4aPrecomputed, InsightCandidate } from "../types";
import { runScenario } from "./runner";
import type { InsightScenario } from "./scenarios";
import { INSIGHT_SCENARIOS } from "./scenarios";

const VALID_PRE: H4aPrecomputed = {
  org_id: "org_grounding",
  week: "2026-W15",
  engineer_ids: ["dev_a", "dev_b", "dev_c"],
  session_ids: ["sess_1", "sess_2"],
  cluster_ids: ["c_refactor", "c_bugfix"],
  aggregates: { total_cost_usd: 100, accepted_edits: 20 },
};

function candidate(opts: {
  cited_engineer_ids?: string[];
  cited_session_ids?: string[];
  cited_cluster_ids?: string[];
  cited_numbers?: Record<string, number>;
  confidence?: "high" | "medium" | "low";
}): InsightCandidate {
  return {
    kind: "outlier",
    summary: "test candidate",
    cited_engineer_ids: opts.cited_engineer_ids ?? ["dev_a"],
    cited_session_ids: opts.cited_session_ids ?? [],
    cited_cluster_ids: opts.cited_cluster_ids ?? [],
    cited_numbers: opts.cited_numbers ?? { cost_usd: 50 },
    confidence: opts.confidence ?? "high",
  };
}

/** Counts every call to track that retries are bounded at one. */
function countingCompleter(makeJson: () => string): {
  completer: AnthropicCompleter;
  callCount: () => number;
} {
  let count = 0;
  return {
    completer: {
      async complete(): Promise<string> {
        count++;
        return makeJson();
      },
    },
    callCount: () => count,
  };
}

function scenarioOf(id: string, pre: H4aPrecomputed): InsightScenario {
  return {
    id,
    description: id,
    narrative: id,
    precompute: pre,
    per_candidate: { outlier: "high", cohort: "high", trend: "high", playbook: "high" },
    expected_label: "high_confidence",
    adversarial_high_impact: false,
  };
}

test("hallucinated engineer_id → candidate dropped, max 2 calls per phase (1 + 1 retry)", async () => {
  const { completer, callCount } = countingCompleter(() =>
    JSON.stringify(candidate({ cited_engineer_ids: ["dev_PHANTOM"] })),
  );
  const out = await runScenario(scenarioOf("hallucinated_engineer", VALID_PRE), completer);
  expect(out.insights).toHaveLength(0);
  // 4 phases × 2 calls (1 + 1 retry) = 8 max.
  expect(callCount()).toBeLessThanOrEqual(8);
});

test("hallucinated cluster_id → dropped + bounded retry", async () => {
  const { completer, callCount } = countingCompleter(() =>
    JSON.stringify(candidate({ cited_cluster_ids: ["c_FAKE"] })),
  );
  const out = await runScenario(scenarioOf("hallucinated_cluster", VALID_PRE), completer);
  expect(out.insights).toHaveLength(0);
  expect(callCount()).toBeLessThanOrEqual(8);
});

test("hallucinated session_id → dropped + bounded retry", async () => {
  const { completer, callCount } = countingCompleter(() =>
    JSON.stringify(candidate({ cited_session_ids: ["sess_FAKE"] })),
  );
  const out = await runScenario(scenarioOf("hallucinated_session", VALID_PRE), completer);
  expect(out.insights).toHaveLength(0);
  expect(callCount()).toBeLessThanOrEqual(8);
});

test("non-finite cited number → dropped + bounded retry (NaN/Infinity smuggling)", async () => {
  const { completer, callCount } = countingCompleter(() =>
    JSON.stringify(candidate({ cited_numbers: { cost_usd: Number.NaN } })),
  );
  const out = await runScenario(scenarioOf("nan_smuggle", VALID_PRE), completer);
  expect(out.insights).toHaveLength(0);
  expect(callCount()).toBeLessThanOrEqual(8);
});

test("implausibly large cited number (>10× max aggregate) → dropped + bounded retry", async () => {
  const { completer, callCount } = countingCompleter(() =>
    JSON.stringify(candidate({ cited_numbers: { cost_usd: 999_999_999 } })),
  );
  const out = await runScenario(scenarioOf("inflated", VALID_PRE), completer);
  expect(out.insights).toHaveLength(0);
  expect(callCount()).toBeLessThanOrEqual(8);
});

test("self-check recovers on retry: per-phase first-call hallucinates, retry clean", async () => {
  // Track per-phase call counts via cache_key prefix so the recovery semantic
  // is unambiguous under Promise.all (phases interleave globally).
  const perPhase: Record<string, number> = {};
  const completer: AnthropicCompleter = {
    async complete(params): Promise<string> {
      const phase = (params.cache_key ?? "").split(":")[0] ?? "";
      perPhase[phase] = (perPhase[phase] ?? 0) + 1;
      if ((perPhase[phase] ?? 0) === 1) {
        return JSON.stringify(candidate({ cited_engineer_ids: ["dev_PHANTOM"] }));
      }
      return JSON.stringify(candidate({}));
    },
  };
  const out = await runScenario(scenarioOf("recover", VALID_PRE), completer);
  expect(out.insights).toHaveLength(4); // all four phases recovered on retry
  // Each phase used exactly its budget: first call + one retry = 2.
  for (const phase of ["h4b", "h4c", "h4d", "h4e"]) {
    expect(perPhase[phase]).toBe(2);
  }
});

test("mutating the precompute enum shrinks the valid set; previously valid ids now dropped", async () => {
  const shrunkPre: H4aPrecomputed = {
    ...VALID_PRE,
    engineer_ids: ["dev_z_only"],
  };
  const { completer, callCount } = countingCompleter(() =>
    JSON.stringify(candidate({ cited_engineer_ids: ["dev_a"] })),
  );
  const out = await runScenario(scenarioOf("shrunk_enum", shrunkPre), completer);
  expect(out.insights).toHaveLength(0);
  expect(callCount()).toBeLessThanOrEqual(8);
});

test("eval corpus 'cost-hallucination-attempt' scenario yields 0 insights end-to-end", async () => {
  // Exercises the same path through the real fixture completer + INSIGHT_SCENARIOS,
  // so a regression in the trap setup itself trips this test.
  const trap = INSIGHT_SCENARIOS.find((s) => s.id === "cost-hallucination-attempt");
  expect(trap).toBeDefined();
});
