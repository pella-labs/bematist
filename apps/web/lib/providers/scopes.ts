/**
 * Scope helpers for provider credentials. Currently GitLab-shaped; generalize
 * when a second provider needs the same gating.
 */

/** Scopes that imply write access against the GitLab API. */
const GITLAB_WRITE_SCOPES = new Set([
  "api",                // full read/write
  "write_repository",   // narrow write — listed for completeness
]);

/** Parse the stored comma-separated scopes string. NULL → empty array. */
export function parseScopes(stored: string | null | undefined): string[] {
  if (!stored) return [];
  return stored.split(",").map(s => s.trim()).filter(Boolean);
}

/** True when the credential can perform write operations (e.g. invite members). */
export function gitlabCanWrite(stored: string | null | undefined): boolean {
  const scopes = parseScopes(stored);
  return scopes.some(s => GITLAB_WRITE_SCOPES.has(s));
}

/** True when the credential can read at all (i.e. has any of read_api / api / read_repository). */
export function gitlabCanRead(stored: string | null | undefined): boolean {
  const scopes = parseScopes(stored);
  return scopes.some(s => s === "read_api" || s === "api" || s === "read_repository");
}
