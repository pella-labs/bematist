import { describe, it, expect, beforeAll } from "vitest";
import { encodeOauthPending, decodeOauthPending } from "../oauth-pending";

beforeAll(() => {
  // 32-byte base64 key for the AES envelope.
  if (!process.env.PROMPT_MASTER_KEY) {
    process.env.PROMPT_MASTER_KEY = Buffer.alloc(32, "test-key-pad").toString("base64");
  }
});

const sample = () => ({
  state: "abc123",
  userId: "user-1",
  groupIdOrPath: "pella-labs/team-a",
  clientId: "iv23-fake",
  clientSecret: "gloas-fake-secret",
  createdAt: Date.now(),
});

describe("oauth-pending envelope", () => {
  it("round-trips", () => {
    const p = sample();
    const decoded = decodeOauthPending(encodeOauthPending(p));
    expect(decoded).toEqual(p);
  });

  it("rejects payloads older than 10 minutes", () => {
    const p = sample();
    p.createdAt = Date.now() - 11 * 60 * 1000;
    const enc = encodeOauthPending(p);
    expect(() => decodeOauthPending(enc)).toThrow(/expired/);
  });

  it("rejects payloads missing required fields", () => {
    const enc = encodeOauthPending(sample());
    // Tamper: re-encrypt a stripped payload.
    const stripped = { ...sample(), state: "" };
    const encStripped = encodeOauthPending(stripped as any);
    expect(() => decodeOauthPending(encStripped)).toThrow(/required fields/);
    // Sanity: original still decodes.
    expect(() => decodeOauthPending(enc)).not.toThrow();
  });

  it("produces ciphertexts that differ between calls", () => {
    const p = sample();
    expect(encodeOauthPending(p)).not.toEqual(encodeOauthPending(p));
  });
});
