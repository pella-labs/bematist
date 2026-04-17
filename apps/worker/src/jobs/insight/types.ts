/**
 * Types for the 6-call Insight Engine pipeline (H4a–H4f).
 *
 * CLAUDE.md AI Rules:
 *   - Decomposed, NOT one-shot.
 *   - ID enum grounding: every cited ID MUST come from a constrained enum
 *     supplied to the prompt. No hallucinated UUIDs.
 *   - Self-check pass (H4f) verifies cited IDs + numbers, regenerates
 *     failing calls ONCE, drops if still failing.
 *   - High-confidence gate at the end: only High shown; Med labeled
 *     "investigate"; Low dropped.
 *   - Haiku 4.5 default (`claude-haiku-4-5-20251001`). BYO ANTHROPIC_API_KEY.
 *   - Prompt-cached via Anthropic `cache_control: { type: "ephemeral" }`.
 */

export type Confidence = "high" | "medium" | "low";

/** Output of the pre-compute step — valid IDs that downstream calls
 *  must cite from. Defensive against LLM hallucination. */
export interface H4aPrecomputed {
  org_id: string;
  week: string;
  engineer_ids: string[];
  session_ids: string[];
  cluster_ids: string[];
  /** Key numeric aggregates the self-check step (H4f) verifies. */
  aggregates: Record<string, number>;
}

export interface InsightCandidate {
  kind: "outlier" | "cohort" | "trend" | "playbook";
  summary: string;
  cited_engineer_ids: string[];
  cited_session_ids: string[];
  cited_cluster_ids: string[];
  cited_numbers: Record<string, number>;
  confidence: Confidence;
}

/** Final output: candidates that survived the self-check + High-confidence gate. */
export interface InsightResult {
  org_id: string;
  week: string;
  insights: InsightCandidate[];
  dropped_low_confidence: number;
}

/**
 * Minimal Anthropic client shape. Real client is plugged in at runtime;
 * tests inject a stub. Keeps this package free of an @anthropic-ai/sdk
 * dep until activation.
 */
export interface AnthropicCompleter {
  /** Returns the assistant's JSON-parseable text. Errors on non-2xx. */
  complete(params: {
    system: string;
    user: string;
    /** Ephemeral cache hint; the real call sets `cache_control`. */
    cache_key?: string;
  }): Promise<string>;
}
