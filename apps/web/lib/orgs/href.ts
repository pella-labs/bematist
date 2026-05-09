/**
 * Build an in-app URL for an org. Encodes the whole slug, so multi-segment
 * GitLab paths (`pella-labs/team-a`) become URL-safe (`pella-labs%2Fteam-a`)
 * and route to `app/org/[slug]/page.tsx` as a single segment, which Next.js
 * decodes back to `params.slug = "pella-labs/team-a"`.
 *
 * Single-segment GitHub slugs are unchanged (encodeURIComponent is a no-op for
 * `pella-labs`).
 */
export function orgHref(slug: string, sub?: string): string {
  const base = `/org/${encodeURIComponent(slug)}`;
  return sub ? `${base}/${sub.replace(/^\/+/, "")}` : base;
}
