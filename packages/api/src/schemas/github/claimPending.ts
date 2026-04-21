import { z } from "zod";

/**
 * PRD §17 B1 — admin claim of a `github_pending_installations` row.
 * Promotes the pending row into a tenant-bound `github_installations`
 * active row, records the webhook_secret / token refs the admin wants
 * Bema to use, and marks the pending row claimed.
 */
export const ClaimPendingInstallationInput = z.object({
  pending_id: z.string().min(1),
  token_ref: z.string().min(1),
  webhook_secret_ref: z.string().min(1),
});
export type ClaimPendingInstallationInput = z.infer<typeof ClaimPendingInstallationInput>;

export const ClaimPendingInstallationOutput = z.object({
  installation_id: z.string(),
  tenant_id: z.string(),
  claimed_at: z.string(),
});
export type ClaimPendingInstallationOutput = z.infer<typeof ClaimPendingInstallationOutput>;

export const ListPendingInstallationsOutput = z.object({
  pending: z.array(
    z.object({
      id: z.string(),
      installation_id: z.string(),
      github_org_id: z.string(),
      github_org_login: z.string(),
      app_id: z.string(),
      target_type: z.string(),
      repositories_selected_count: z.number().int(),
      received_at: z.string(),
    }),
  ),
});
export type ListPendingInstallationsOutput = z.infer<typeof ListPendingInstallationsOutput>;
