/**
 * Cohort normalization — Step 2 of `ai_leverage_v1`.
 *
 * Sprint-1 stub: naive implementations so callers can typecheck.
 * Sprint-2 replaces with the locked winsorize-then-percentile-rank pipeline
 * (h-scoring-prd §7 Step 2). Any change here must keep the <30s eval budget
 * and deterministic output.
 */

/**
 * Clamp each value to `[p5Value, p95Value]`.
 *
 * TODO(Sprint-2): handle edge cases per the locked spec —
 *   - empty cohort → return `values` unchanged (upstream gate suppresses display)
 *   - cohort with identical values → clamp to single value (p5=p95)
 *   - tie-breaking at boundaries follows `Math.max(min, Math.min(max, v))`
 */
export function winsorize(values: number[], p5: number, p95: number): number[] {
  return values.map((v) => Math.max(p5, Math.min(p95, v)));
}

/**
 * Return the percentile rank of `value` within `cohort`, in [0, 100].
 *
 * TODO(Sprint-2): replace with the locked definition (linear interpolation
 * across ties, Hyndman–Fan "Type 7" convention, to match what the 500-case
 * eval fixture expects).
 *
 * Naive Sprint-1 impl: fraction of cohort strictly less than `value`, scaled
 * to 0..100. Enough to typecheck; not enough to ship.
 */
export function percentileRank(value: number, cohort: number[]): number {
  if (cohort.length === 0) return 50;
  let lessThan = 0;
  for (const peer of cohort) {
    if (peer < value) lessThan++;
  }
  return (lessThan / cohort.length) * 100;
}
