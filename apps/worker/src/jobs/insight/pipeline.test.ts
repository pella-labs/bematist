import { expect, test } from "bun:test";
import { validateCandidate } from "./h4f_self_check";
import { runInsightEngine } from "./pipeline";
import type { AnthropicCompleter, H4aPrecomputed, InsightCandidate } from "./types";

const PRE: H4aPrecomputed = {
  org_id: "org_x",
  week: "2026-W15",
  engineer_ids: ["dev_a", "dev_b"],
  session_ids: ["sess_1", "sess_2"],
  cluster_ids: ["c_refactor"],
  aggregates: { total_cost_usd: 100, accepted_edits: 20 },
};

/** Fake completer keyed by cache_key prefix (h4b/h4c/h4d/h4e). Each key returns a
 *  queue of responses consumed in order. Safe under Promise.all — keys are unique. */
function fakeCompleter(byKey: Record<string, string[]>): AnthropicCompleter {
  const queues: Record<string, string[]> = { ...byKey };
  return {
    async complete(params): Promise<string> {
      const key = (params.cache_key ?? "").split(":")[0] ?? "";
      const q = queues[key];
      if (!q || q.length === 0) throw new Error(`fakeCompleter: no response for key ${key}`);
      return q.shift() as string;
    },
  };
}

const cleanCandidate: InsightCandidate = {
  kind: "outlier",
  summary: "dev_a is a cost outlier",
  cited_engineer_ids: ["dev_a"],
  cited_session_ids: ["sess_1"],
  cited_cluster_ids: [],
  cited_numbers: { cost_usd: 50 },
  confidence: "high",
};

const hallucinatedCandidate: InsightCandidate = {
  ...cleanCandidate,
  cited_engineer_ids: ["dev_FAKE"],
};

const mediumCandidate: InsightCandidate = { ...cleanCandidate, confidence: "medium" };
const lowCandidate: InsightCandidate = { ...cleanCandidate, confidence: "low" };

test("validateCandidate: clean candidate has no failures", () => {
  expect(validateCandidate(cleanCandidate, PRE)).toEqual([]);
});

test("validateCandidate: hallucinated engineer_id flagged", () => {
  const failures = validateCandidate(hallucinatedCandidate, PRE);
  expect(failures.length).toBe(1);
  expect(failures[0]).toContain("hallucinated_engineer:dev_FAKE");
});

test("validateCandidate: implausible cited number flagged", () => {
  const bad: InsightCandidate = {
    ...cleanCandidate,
    cited_numbers: { cost_usd: 999_999_999 },
  };
  const failures = validateCandidate(bad, PRE);
  expect(failures.some((f) => f.startsWith("implausible:"))).toBe(true);
});

test("validateCandidate: non-finite number flagged", () => {
  const bad: InsightCandidate = {
    ...cleanCandidate,
    cited_numbers: { cost_usd: Number.NaN },
  };
  expect(validateCandidate(bad, PRE)).toContain("non_finite:cost_usd");
});

test("runInsightEngine: happy path — 4 clean high-confidence candidates surface", async () => {
  const completer = fakeCompleter({
    h4b: [JSON.stringify(cleanCandidate)],
    h4c: [JSON.stringify(cleanCandidate)],
    h4d: [JSON.stringify(cleanCandidate)],
    h4e: [JSON.stringify(cleanCandidate)],
  });
  const out = await runInsightEngine({ org_id: "org_x", week: "2026-W15", completer });
  expect(out.insights).toHaveLength(4);
  expect(out.dropped_low_confidence).toBe(0);
});

test("runInsightEngine: self-check retries once; drops on second failure", async () => {
  const completer = fakeCompleter({
    h4b: [JSON.stringify(hallucinatedCandidate), JSON.stringify(hallucinatedCandidate)],
    h4c: [JSON.stringify(cleanCandidate)],
    h4d: [JSON.stringify(cleanCandidate)],
    h4e: [JSON.stringify(cleanCandidate)],
  });
  const out = await runInsightEngine({ org_id: "org_x", week: "2026-W15", completer });
  expect(out.insights).toHaveLength(3); // H4b dropped; H4c/H4d/H4e kept
});

test("runInsightEngine: self-check retries once and recovers", async () => {
  const completer = fakeCompleter({
    h4b: [JSON.stringify(hallucinatedCandidate), JSON.stringify(cleanCandidate)],
    h4c: [JSON.stringify(cleanCandidate)],
    h4d: [JSON.stringify(cleanCandidate)],
    h4e: [JSON.stringify(cleanCandidate)],
  });
  const out = await runInsightEngine({ org_id: "org_x", week: "2026-W15", completer });
  expect(out.insights).toHaveLength(4);
});

test("runInsightEngine: low-confidence candidates dropped; medium kept", async () => {
  const completer = fakeCompleter({
    h4b: [JSON.stringify(cleanCandidate)], // high
    h4c: [JSON.stringify(mediumCandidate)], // medium — kept
    h4d: [JSON.stringify(lowCandidate)], // low — dropped
    h4e: [JSON.stringify(cleanCandidate)], // high
  });
  const out = await runInsightEngine({ org_id: "org_x", week: "2026-W15", completer });
  expect(out.insights).toHaveLength(3);
  expect(out.dropped_low_confidence).toBe(1);
  expect(out.insights.find((i) => i.confidence === "low")).toBeUndefined();
});
