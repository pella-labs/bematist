import { createHash } from "node:crypto";

/**
 * SHA-256 of a card bearer token. The plain token is shown to the user once;
 * only this hash is stored in `card_tokens.token_hash`. Must be identical
 * between mint (`/api/card/token`, `/api/card/token-by-star`) and consume
 * (`/api/card/submit`) — do not inline-hash in routes.
 */
export function hashCardToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
