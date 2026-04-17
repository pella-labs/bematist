import type { H4aPrecomputed, InsightCandidate } from "./types";

/**
 * H4f: deterministic self-check. No LLM. Validates:
 *   - every cited engineer_id / session_id / cluster_id is in the H4a enum
 *   - every cited number is plausible (not NaN, not absurdly outside
 *     the aggregate bounds — conservative ≤10× max aggregate).
 *
 * Returns the list of failure reasons. Empty list = candidate is clean.
 */
export function validateCandidate(cand: InsightCandidate, pre: H4aPrecomputed): string[] {
  const failures: string[] = [];
  const engineerSet = new Set(pre.engineer_ids);
  const sessionSet = new Set(pre.session_ids);
  const clusterSet = new Set(pre.cluster_ids);

  for (const id of cand.cited_engineer_ids) {
    if (!engineerSet.has(id)) failures.push(`hallucinated_engineer:${id}`);
  }
  for (const id of cand.cited_session_ids) {
    if (!sessionSet.has(id)) failures.push(`hallucinated_session:${id}`);
  }
  for (const id of cand.cited_cluster_ids) {
    if (!clusterSet.has(id)) failures.push(`hallucinated_cluster:${id}`);
  }

  const aggValues = Object.values(pre.aggregates);
  const maxAgg = aggValues.length > 0 ? Math.max(...aggValues) : 0;
  const ceiling = Math.max(maxAgg * 10, 1);
  for (const [k, v] of Object.entries(cand.cited_numbers)) {
    if (!Number.isFinite(v)) {
      failures.push(`non_finite:${k}`);
      continue;
    }
    if (Math.abs(v) > ceiling) failures.push(`implausible:${k}=${v}`);
  }

  return failures;
}
