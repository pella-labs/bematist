import type { ProviderName } from "@/lib/providers/types";

/**
 * Build an in-app URL for an org. URL shape: `/org/{provider}/{slug}` (provider
 * is part of the URL so a GitHub `acme` and a GitLab `acme` can coexist as
 * separate orgs and route to their own pages).
 *
 * Multi-segment GitLab paths (`pella-labs/team-a`) get URL-encoded — Next.js
 * decodes `params.slug` back to the literal string with `/`.
 */
export function orgHref(provider: ProviderName, slug: string, sub?: string): string {
  const base = `/org/${provider}/${encodeURIComponent(slug)}`;
  return sub ? `${base}/${sub.replace(/^\/+/, "")}` : base;
}
