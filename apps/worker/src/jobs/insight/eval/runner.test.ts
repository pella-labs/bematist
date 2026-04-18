import { expect, test } from "bun:test";
import { fixtureCompleterForScenario } from "./completer";
import {
  classifyPipelineOutput,
  type EvalRun,
  type ExpectedLabel,
  type JudgeClient,
  MAE_GATE,
  mockJudge,
  runAdversarialEval,
  runScenario,
} from "./runner";
import { INSIGHT_SCENARIOS, SCENARIO_COUNT } from "./scenarios";

// ---- corpus shape -----------------------------------------------------------

test("scenarios corpus has exactly 50 cases (CLAUDE.md §AI Rules)", () => {
  expect(SCENARIO_COUNT).toBe(50);
  expect(INSIGHT_SCENARIOS.length).toBe(50);
});

test("corpus includes ≥10 adversarial Goodhart traps", () => {
  const traps = INSIGHT_SCENARIOS.filter((s) => s.adversarial_high_impact);
  expect(traps.length).toBeGreaterThanOrEqual(10);
});

test("every scenario has a precompute with non-empty engineer + cluster + session enums", () => {
  for (const s of INSIGHT_SCENARIOS) {
    expect(s.precompute.engineer_ids.length).toBeGreaterThan(0);
    expect(s.precompute.cluster_ids.length).toBeGreaterThan(0);
    expect(s.precompute.session_ids.length).toBeGreaterThan(0);
  }
});

test("scenario ids are unique", () => {
  const set = new Set(INSIGHT_SCENARIOS.map((s) => s.id));
  expect(set.size).toBe(INSIGHT_SCENARIOS.length);
});

// ---- single-scenario sanity -------------------------------------------------

test("runScenario respects the H4f self-check (hallucinated id → drop)", async () => {
  const trap = INSIGHT_SCENARIOS.find((s) => s.id === "cost-hallucination-attempt");
  expect(trap).toBeDefined();
  if (!trap) return;
  const completer = fixtureCompleterForScenario(trap);
  const out = await runScenario(trap, completer);
  expect(out.insights).toHaveLength(0);
  // No "low" entries either — H4f drops upstream before the keep gate can count them.
  expect(out.dropped_low_confidence).toBe(0);
});

test("classifyPipelineOutput maps high → high_confidence, medium-only → investigate, empty → drop", () => {
  expect(
    classifyPipelineOutput({
      org_id: "x",
      week: "w",
      insights: [
        {
          kind: "outlier",
          summary: "",
          cited_engineer_ids: [],
          cited_session_ids: [],
          cited_cluster_ids: [],
          cited_numbers: {},
          confidence: "high",
        },
      ],
      dropped_low_confidence: 0,
    }),
  ).toBe("high_confidence");

  expect(
    classifyPipelineOutput({
      org_id: "x",
      week: "w",
      insights: [
        {
          kind: "cohort",
          summary: "",
          cited_engineer_ids: [],
          cited_session_ids: [],
          cited_cluster_ids: [],
          cited_numbers: {},
          confidence: "medium",
        },
      ],
      dropped_low_confidence: 0,
    }),
  ).toBe("investigate");

  expect(
    classifyPipelineOutput({
      org_id: "x",
      week: "w",
      insights: [],
      dropped_low_confidence: 4,
    }),
  ).toBe("drop");
});

// ---- THE MERGE BLOCKER ------------------------------------------------------

/**
 * Per CLAUDE.md §AI Rules + §Testing Rules:
 *   "Eval suite includes adversarial scenarios (50 synthetic team-week cases).
 *    Model must NOT mislabel a high-token / high-impact dev as 'inefficient.'
 *    LLM-judge gate ≥ 0.7 in CI."
 *
 * MAE_GATE = 0.3 ⇔ score ≥ 0.7. This test FAILS (not just warns) on regression.
 */
test("MERGE BLOCKER: 50-case adversarial eval clears LLM-judge ≥ 0.7 (MAE ≤ 0.3)", async () => {
  const run = await runAdversarialEval({ judge: mockJudge });

  expect(run.total).toBe(50);
  expect(run.mae).toBeLessThanOrEqual(MAE_GATE);
  expect(run.passed_gate).toBe(true);

  // Adversarial Goodhart traps are the load-bearing ones; require 100% on them.
  // The model MUST NOT mislabel a high-impact dev as inefficient. Allowing any
  // trap to fail would defeat the gate's purpose.
  expect(run.adversarial_pass_rate).toBe(1);

  // No silent ambiguity — if the engine emits something the judge can't read,
  // the corpus or the engine has drifted; surface that as a fail.
  expect(run.ambiguous).toBe(0);
});

test("regression contract: a broken pipeline that always drops fails the gate", async () => {
  const dropEverything: JudgeClient = {
    async score({ scenario, expected_label }) {
      // Simulate observing "drop" for every scenario regardless of expected.
      const observed: ExpectedLabel = "drop";
      return observed === expected_label
        ? {
            verdict: "pass",
            reasoning: `${scenario.id}: matched drop`,
          }
        : {
            verdict: "fail",
            reasoning: `${scenario.id}: expected ${expected_label} observed drop`,
          };
    },
  };
  const run: EvalRun = await runAdversarialEval({ judge: dropEverything });
  expect(run.passed_gate).toBe(false);
  expect(run.mae).toBeGreaterThan(MAE_GATE);
});
