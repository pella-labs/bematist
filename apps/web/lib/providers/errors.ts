/**
 * Provider-call failure taxonomy. Every provider call should map HTTP outcomes
 * to one of these so the calling route can render a sensible UX (reconnect
 * banner, "user not found", retry-after, etc.) without sniffing status codes.
 */

export type ProviderErrorCode =
  | "expired_credential"
  | "permission_denied"
  | "not_found"
  | "rate_limited"
  | "network"
  | "unknown";

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    public readonly status?: number,
    public readonly retryAfterSec?: number,
    message?: string,
  ) {
    super(message ?? `Provider error: ${code}${status ? ` (HTTP ${status})` : ""}`);
    this.name = "ProviderError";
  }
}

/** Map a raw HTTP response status to a ProviderErrorCode. */
export function mapHttpStatusToProviderError(status: number, retryAfter?: string | null): ProviderError {
  if (status === 401) return new ProviderError("expired_credential", status);
  if (status === 403) return new ProviderError("permission_denied", status);
  if (status === 404) return new ProviderError("not_found", status);
  if (status === 429) {
    const retryAfterSec = retryAfter ? Math.max(0, parseInt(retryAfter, 10) || 0) : undefined;
    return new ProviderError("rate_limited", status, retryAfterSec);
  }
  return new ProviderError("unknown", status);
}
