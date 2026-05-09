import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * Refuse to insert an org whose slug prefix-overlaps an existing same-provider org.
 *
 * The ingest path uses longest-prefix matching to attribute sessions to orgs (see
 * docs/multi-provider.md §8). If two orgs at the same provider had overlapping
 * slugs (e.g. `acme` and `acme/platform`), a session in `acme/platform/repo` could
 * be attributed to either depending on insert order — a tenant-leak vector.
 *
 * Rule: for a given provider, no two slugs may be prefix-related under '/' boundary.
 *   `acme`  vs  `acme/platform`     → overlap (rejected)
 *   `acme`  vs  `acme-corp`         → ok (different segment)
 *   `acme/a` vs `acme/b`            → ok (siblings)
 *   `acme/a` vs `acme/a/b`          → overlap (rejected)
 */
export class SlugOverlapError extends Error {
  constructor(public readonly conflictingSlug: string) {
    super(`Slug prefix-overlaps existing org "${conflictingSlug}"`);
    this.name = "SlugOverlapError";
  }
}

function isPrefixOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  return longer === shorter || longer.startsWith(shorter + "/");
}

export async function assertNoSlugOverlap(
  provider: "github" | "gitlab",
  newSlug: string,
): Promise<void> {
  const existing = await db
    .select({ slug: schema.org.slug })
    .from(schema.org)
    .where(eq(schema.org.provider, provider));
  for (const row of existing) {
    if (isPrefixOverlap(row.slug, newSlug)) {
      throw new SlugOverlapError(row.slug);
    }
  }
}
