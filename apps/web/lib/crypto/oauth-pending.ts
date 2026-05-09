import { encryptOrgCredential, decryptOrgCredential } from "./org-credentials";

/**
 * Short-lived envelope for the GitLab OAuth round-trip.
 *
 * After the customer pastes their App's client_id + client_secret + group_id,
 * we encrypt those into a HttpOnly cookie that survives the redirect to
 * gitlab.com and back. The state parameter sent to GitLab is also embedded so
 * the callback can CSRF-verify the response.
 *
 * Reuses the AES-256-GCM envelope from lib/crypto/org-credentials.ts (same
 * PROMPT_MASTER_KEY). Cookie payload < 1KB, well under the 4KB limit.
 */

export type OauthPendingPayload = {
  state: string;            // CSRF token; must match the `state` query param GitLab returns
  userId: string;
  groupIdOrPath: string;    // numeric id or URL-encodable path
  clientId: string;
  clientSecret: string;     // plaintext only inside the encrypted envelope
  /** ms since epoch when this payload was created — for sanity-check expiry. */
  createdAt: number;
};

const TEN_MINUTES_MS = 10 * 60 * 1000;

export function encodeOauthPending(p: OauthPendingPayload): string {
  return encryptOrgCredential(JSON.stringify(p));
}

export function decodeOauthPending(packed: string): OauthPendingPayload {
  const json = decryptOrgCredential(packed);
  const p = JSON.parse(json) as OauthPendingPayload;
  if (!p.state || !p.clientId || !p.clientSecret || !p.groupIdOrPath || !p.userId) {
    throw new Error("oauth-pending payload missing required fields");
  }
  if (typeof p.createdAt !== "number" || Date.now() - p.createdAt > TEN_MINUTES_MS) {
    throw new Error("oauth-pending payload expired");
  }
  return p;
}

export const OAUTH_PENDING_COOKIE = "pl_gitlab_oauth_pending";
