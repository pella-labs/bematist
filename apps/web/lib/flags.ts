// Compliance UX feature flag.
//
// Convention: any user-facing compliance surface (Bill of Rights page,
// works-council consent modal, DPA acceptance flow, tier-selection picker,
// erasure UI, privacy banners, etc.) MUST call isComplianceEnabled() before
// rendering. When the helper returns false, the surface is hidden — the
// underlying canonical contract (BILL_OF_RIGHTS constant in
// @bematist/config, legal templates, audit logging, signed-config
// verification) stays untouched.
//
// This flag does NOT affect backend invariants: k-anon gates, name-hashing,
// server-side redaction, RLS, audit log writes, partition drops, Tier-C 403
// guard, signed-config verification, or any of the privacy adversarial test
// gates. Those are load-bearing in every environment.
//
// Polarity: enabled by default. Only the literal lowercase strings "0" or
// "false" disable the flag. Anything else (unset, empty, "FALSE", typos)
// fails safe to enabled.
//
// Lives in apps/web/lib/ rather than @bematist/config because every current
// and planned compliance UX surface is in the web app — the collector,
// ingest, and worker do not render UX. If a non-web surface ever needs the
// same flag, lift this helper to a shared package then.

export function isComplianceEnabled(): boolean {
  const v = process.env.BEMATIST_COMPLIANCE_ENABLED;
  return v !== "0" && v !== "false";
}
