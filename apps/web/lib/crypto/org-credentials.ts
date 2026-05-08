import crypto from "node:crypto";

/**
 * Encryption envelope for `org_credentials.token_enc`. AES-256-GCM with the
 * server's PROMPT_MASTER_KEY. Format mirrors lib/crypto/prompts.ts:
 *   iv(base64).tag(base64).ciphertext(base64)
 *
 * Used today for GitLab Group Access Tokens. Future credential `kind`s may
 * adopt this same envelope.
 */

function masterKey(): Buffer {
  const b64 = process.env.PROMPT_MASTER_KEY;
  if (!b64) throw new Error("PROMPT_MASTER_KEY not set");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("PROMPT_MASTER_KEY must decode to 32 bytes");
  return key;
}

export function encryptOrgCredential(plaintext: string): string {
  const mk = masterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", mk, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

export function decryptOrgCredential(packed: string): string {
  const mk = masterKey();
  const [ivB64, tagB64, ctB64] = packed.split(".");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("malformed org credential");
  const decipher = crypto.createDecipheriv("aes-256-gcm", mk, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return pt.toString("utf8");
}
