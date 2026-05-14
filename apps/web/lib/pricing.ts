// Published per-1M pricing (USD). Used for dollar display only.
export const PRICING: Record<string, { in: number; out: number; cr: number; cw: number }> = {
  "claude-opus-4-7":          { in: 15, out: 75, cr: 1.50, cw: 18.75 },
  "claude-opus-4-5-20251101": { in: 15, out: 75, cr: 1.50, cw: 18.75 },
  "claude-opus-4-6":          { in: 15, out: 75, cr: 1.50, cw: 18.75 },
  "claude-sonnet-4-6":        { in: 3,  out: 15, cr: 0.30, cw: 3.75 },
  "claude-sonnet-4-20250514": { in: 3,  out: 15, cr: 0.30, cw: 3.75 },
  "claude-haiku-4-5-20251001":{ in: 0.80, out: 4, cr: 0.08, cw: 1.00 },
  "codex":                    { in: 1.25, out: 10, cr: 0.125, cw: 0 },
  // Cursor is a flat subscription — users don't pay per token, so per-token
  // rates are 0 across the Cursor model surface we've observed in the wild.
  "claude-4.5-sonnet":          { in: 0, out: 0, cr: 0, cw: 0 },
  "claude-4.5-sonnet-thinking": { in: 0, out: 0, cr: 0, cw: 0 },
  "claude-4.6-opus-high":       { in: 0, out: 0, cr: 0, cw: 0 },
  "composer-1":                 { in: 0, out: 0, cr: 0, cw: 0 },
  "composer-1.5":               { in: 0, out: 0, cr: 0, cw: 0 },
  "gpt-5.1-codex-mini":         { in: 0, out: 0, cr: 0, cw: 0 },
  "default":                    { in: 0, out: 0, cr: 0, cw: 0 },
};

export function costFor(model: string | null, u: { tokensIn: number; tokensOut: number; tokensCacheRead: number; tokensCacheWrite: number }) {
  const p = PRICING[model ?? ""] ?? PRICING["claude-sonnet-4-6"];
  return (
    (u.tokensIn / 1e6) * p.in +
    (u.tokensOut / 1e6) * p.out +
    (u.tokensCacheRead / 1e6) * p.cr +
    (u.tokensCacheWrite / 1e6) * p.cw
  );
}

export function money(x: number) {
  if (x >= 1000) return `$${(x / 1000).toFixed(1)}K`;
  return `$${x.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Insights revamp (P7): DB-driven pricing via model_pricing table.
// Cost is computed at read time. Stored centi-cents per million tokens.
// 1 centi-cent = $0.0001. 1 USD = 10,000 centi-cents.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { modelPricing } from "@/lib/db/schema";
import { and, desc, eq, isNull, lte, or, gt } from "drizzle-orm";

export type PricingRow = typeof modelPricing.$inferSelect;

/** Returns the active pricing row for `model` at instant `at`, or null. */
export async function priceFor(model: string, at: Date): Promise<PricingRow | null> {
  const rows = await db
    .select()
    .from(modelPricing)
    .where(
      and(
        eq(modelPricing.model, model),
        lte(modelPricing.effectiveFrom, at),
        or(isNull(modelPricing.effectiveTo), gt(modelPricing.effectiveTo, at)),
      ),
    )
    .orderBy(desc(modelPricing.effectiveFrom))
    .limit(1);
  return rows[0] ?? null;
}

export type TokenUsage = {
  tokensIn: number;
  tokensOut: number;
  tokensCacheRead: number;
  tokensCacheWrite: number;
};

/** Computes total centi-cents from token usage using the row's per-Mtok rates. */
export function applyPricing(row: PricingRow, u: TokenUsage): number {
  return (
    (u.tokensIn / 1_000_000) * row.inputCentiPerMtok +
    (u.tokensOut / 1_000_000) * row.outputCentiPerMtok +
    (u.tokensCacheRead / 1_000_000) * row.cacheReadCentiPerMtok +
    (u.tokensCacheWrite / 1_000_000) * row.cacheWriteCentiPerMtok
  );
}

/**
 * Computes cost in centi-cents for a token bundle at instant `at`.
 * Throws if model is unknown — caller decides how to surface "unpriced".
 */
export async function costFromTokens(
  args: TokenUsage & { model: string; at: Date },
): Promise<number> {
  const row = await priceFor(args.model, args.at);
  if (!row) throw new Error(`unknown model pricing: ${args.model}`);
  return applyPricing(row, args);
}

export function centiCentsToUsd(centi: number): number {
  return centi / 10_000;
}
