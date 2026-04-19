// Authoritative repo_id_hash HMAC (D33) + placeholder detection.
//
// The G1-initial-sync worker writes `repo_id_hash = 'gh:pending:<tenant>:<provider_repo_id>'`
// as a UTF-8 placeholder into `repos.repo_id_hash` because the authoritative
// HMAC requires the per-tenant salt that the linker (this worker) owns. When
// we compute state, if the placeholder shows up in inputs, we rewrite it to
// the authoritative hash BEFORE sha256-hashing the input set so the
// commutativity gate sees a stable key.
//
// Tenant-salt source decision (G1):
//   - No `orgs.tenant_salt` column exists at HEAD.
//   - We derive per-tenant salt as `HMAC-SHA256('bematist-repo-id-hash', tenant_id)`
//     — the same shape used by apps/worker/src/github/consumer.ts
//     defaultTenantSalt. When a real `orgs.tenant_salt` column lands
//     (follow-up), we swap the resolver. Documented deviation in PR body.

import { createHmac } from "node:crypto";

export function defaultTenantSalt(orgId: string): Buffer {
  return createHmac("sha256", "bematist-repo-id-hash").update(orgId).digest();
}

export function repoIdHash(tenantSalt: Buffer, providerRepoId: string): Buffer {
  return createHmac("sha256", tenantSalt).update(`github:${providerRepoId}`).digest();
}

export function placeholderFor(tenantId: string, providerRepoId: string): string {
  return `gh:pending:${tenantId}:${providerRepoId}`;
}

/**
 * Best-effort rewrite of a stored repo_id_hash value (bytea OR utf-8
 * placeholder string) back to the authoritative HMAC bytes. `placeholderFor`
 * strings are recognised on-the-wire and re-hashed. Real Buffers pass
 * through unchanged.
 */
export function authoritativeHash(
  stored: Buffer | Uint8Array | string,
  tenantId: string,
  providerRepoId: string,
  tenantSalt: Buffer = defaultTenantSalt(tenantId),
): Buffer {
  if (typeof stored === "string") {
    if (stored.startsWith("gh:pending:")) return repoIdHash(tenantSalt, providerRepoId);
    // A plain hex representation: trust it only if length matches a sha256 digest.
    if (/^[0-9a-f]{64}$/i.test(stored)) return Buffer.from(stored, "hex");
    // Unknown string shape — re-derive.
    return repoIdHash(tenantSalt, providerRepoId);
  }
  const buf = stored instanceof Buffer ? stored : Buffer.from(stored);
  // bytea with exactly 32 bytes → authoritative
  if (buf.length === 32) return buf;
  // Placeholder stored as bytea utf-8 bytes
  const asStr = buf.toString("utf8");
  if (asStr.startsWith("gh:pending:")) return repoIdHash(tenantSalt, providerRepoId);
  return repoIdHash(tenantSalt, providerRepoId);
}
