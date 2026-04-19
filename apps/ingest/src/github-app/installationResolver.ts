// Resolves `installation_id` → per-tenant webhook metadata (PRD §7.1 routing,
// §11.5 rotation). Used by the path-param webhook route
// `POST /v1/webhooks/github/:installation_id`.
//
// Production impl reads `github_installations` over Drizzle (RLS bypassed by
// intent — the resolver IS the tenant lookup, it cannot itself assume
// `app.current_org_id`). Per PRD §9.1 the resolver returns:
//   - tenant_id  (UUID)
//   - status     ('active' | 'suspended' | 'revoked' | 'reconnecting')
//   - webhook_secret_active_ref
//   - webhook_secret_previous_ref | null
//   - webhook_secret_rotated_at   | null
//
// The resolver is the ONLY caller that crosses the tenant boundary without
// RLS — every downstream write uses the resolved `tenant_id` as the RLS
// context (see worker/github consumer).
//
// Tests inject `createInMemoryInstallationResolver` and seed rows.

export type InstallationStatus = "active" | "suspended" | "revoked" | "reconnecting";

export interface InstallationRecord {
  /** `orgs.id` — the internal tenant id used for RLS `app.current_org_id`. */
  tenant_id: string;
  installation_id: bigint;
  github_org_id: bigint;
  github_org_login: string;
  app_id: bigint;
  status: InstallationStatus;
  token_ref: string;
  webhook_secret_active_ref: string;
  webhook_secret_previous_ref: string | null;
  webhook_secret_rotated_at: Date | null;
}

export interface InstallationResolver {
  /**
   * Returns `null` when `installation_id` is unknown OR unreachable. The
   * router maps a `null` to HTTP 404 with code `UNKNOWN_INSTALLATION`. Never
   * throws on miss.
   */
  byInstallationId(installation_id: bigint): Promise<InstallationRecord | null>;
}

export class InMemoryInstallationResolver implements InstallationResolver {
  private readonly byId = new Map<string, InstallationRecord>();

  seed(record: InstallationRecord): void {
    this.byId.set(record.installation_id.toString(), { ...record });
  }

  /**
   * Atomically overwrite `webhook_secret_active_ref` / `previous_ref` /
   * `rotated_at` — mirrors the two-column Postgres swap in PRD §11.5.
   */
  rotate(
    installation_id: bigint,
    next: {
      active_ref: string;
      previous_ref: string | null;
      rotated_at: Date | null;
    },
  ): void {
    const r = this.byId.get(installation_id.toString());
    if (!r) throw new Error("installation:not-seeded");
    r.webhook_secret_active_ref = next.active_ref;
    r.webhook_secret_previous_ref = next.previous_ref;
    r.webhook_secret_rotated_at = next.rotated_at;
  }

  /** Overwrite status column in place (installation.{suspend,unsuspend,deleted}). */
  setStatus(installation_id: bigint, status: InstallationStatus): void {
    const r = this.byId.get(installation_id.toString());
    if (!r) throw new Error("installation:not-seeded");
    r.status = status;
  }

  async byInstallationId(installation_id: bigint): Promise<InstallationRecord | null> {
    const r = this.byId.get(installation_id.toString());
    return r ? { ...r } : null;
  }

  /** Test-only: enumerate all seeded rows. */
  listAll(): InstallationRecord[] {
    return Array.from(this.byId.values()).map((r) => ({ ...r }));
  }
}

export function createInMemoryInstallationResolver(): InMemoryInstallationResolver {
  return new InMemoryInstallationResolver();
}
