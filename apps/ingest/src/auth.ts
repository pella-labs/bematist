// Sprint 0 stub. Real JWT + ingest_keys table lookup arrives in Sprint 1+ (Walid).
// Contract: Authorization: Bearer bm_<orgId>_<rand> (contracts/02-ingest-api.md §Auth).
// Identity is server-derived per event-wire invariant #3 — never trust collector-claimed
// tenant_id / engineer_id on the wire.

export interface AuthContext {
  tenantId: string;
  engineerId: string;
}

export function verifyBearer(header: string | null): AuthContext | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(bm_[A-Za-z0-9_-]+)$/);
  if (!match) return null;
  return { tenantId: "org_dev", engineerId: "eng_dev" };
}
