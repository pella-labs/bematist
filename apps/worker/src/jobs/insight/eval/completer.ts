/**
 * Fixture AnthropicCompleter for the adversarial eval.
 *
 * Routes by `cache_key` prefix (h4b/h4c/h4d/h4e — set by the real H4b–H4e
 * call sites in #26 skeleton) to a per-candidate confidence + cited-id
 * payload derived from the scenario's `per_candidate` map.
 *
 * `none` candidates intentionally cite a hallucinated engineer id so the
 * deterministic H4f self-check drops them. This exercises the citation-
 * grounding contract without poking the pipeline internals.
 *
 * The completer also records every (cache_key, system, user) tuple it
 * received so the envelope test can assert prompt-injection wrapping +
 * prompt-cache hint without re-running the pipeline.
 */

import type { AnthropicCompleter } from "../types";
import type { InsightScenario, PerCandidateLabel } from "./scenarios";

export type CandidateKind = keyof PerCandidateLabel; // "outlier" | "cohort" | "trend" | "playbook"

const KEY_TO_KIND: Record<string, CandidateKind> = {
  h4b: "outlier",
  h4c: "cohort",
  h4d: "trend",
  h4e: "playbook",
};

export interface CapturedCall {
  cache_key: string | undefined;
  system: string;
  user: string;
}

export interface FixtureCompleter extends AnthropicCompleter {
  readonly calls: readonly CapturedCall[];
}

/** Builds a JSON candidate string consistent with the scenario contract.
 *  When the per-candidate label is "none", deliberately cite a hallucinated
 *  engineer id so H4f drops it (citation-grounding test path). */
function candidateJson(scenario: InsightScenario, kind: CandidateKind): string {
  const conf = scenario.per_candidate[kind];
  const firstEngineer = scenario.precompute.engineer_ids[0] ?? "dev_a";
  const firstSession = scenario.precompute.session_ids[0] ?? "sess_1";
  const firstCluster = scenario.precompute.cluster_ids[0] ?? "c_refactor";

  if (conf === "none") {
    return JSON.stringify({
      kind,
      summary: `${kind}: hallucinated id (test-drop path)`,
      cited_engineer_ids: ["dev_PHANTOM_NOT_IN_ENUM"],
      cited_session_ids: [],
      cited_cluster_ids: [],
      cited_numbers: { synthetic_marker: 0 },
      confidence: "high",
    });
  }

  return JSON.stringify({
    kind,
    summary: `${kind}: ${scenario.description}`,
    cited_engineer_ids: scenario.sensitive_dev_id ? [scenario.sensitive_dev_id] : [firstEngineer],
    cited_session_ids: kind === "outlier" ? [firstSession] : [],
    cited_cluster_ids: kind === "cohort" || kind === "playbook" ? [firstCluster] : [],
    cited_numbers: pickPlausibleNumber(scenario, kind),
    confidence: conf,
  });
}

/** Plausible numeric citation drawn from the precompute aggregates so
 *  H4f's value-bound check passes (ceiling = 10× max aggregate). */
function pickPlausibleNumber(
  scenario: InsightScenario,
  kind: CandidateKind,
): Record<string, number> {
  const aggs = scenario.precompute.aggregates;
  const aggKeys = Object.keys(aggs);
  if (aggKeys.length === 0) return { synthetic_marker: 1 };
  const key = aggKeys[Math.abs(hash(`${scenario.id}:${kind}`)) % aggKeys.length] as string;
  return { [key]: aggs[key] ?? 0 };
}

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

/** Build a completer bound to a single scenario. */
export function fixtureCompleterForScenario(scenario: InsightScenario): FixtureCompleter {
  const calls: CapturedCall[] = [];
  return {
    calls,
    async complete(params): Promise<string> {
      calls.push({
        cache_key: params.cache_key,
        system: params.system,
        user: params.user,
      });
      const prefix = (params.cache_key ?? "").split(":")[0] ?? "";
      const kind = KEY_TO_KIND[prefix];
      if (kind === undefined) {
        throw new Error(
          `fixtureCompleter: unknown cache_key prefix '${prefix}' (expected h4b|h4c|h4d|h4e)`,
        );
      }
      return candidateJson(scenario, kind);
    },
  };
}
