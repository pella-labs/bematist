import { describe, it, expect, beforeAll } from "vitest";
import { encryptOrgCredential, decryptOrgCredential } from "../org-credentials";

beforeAll(() => {
  if (!process.env.PROMPT_MASTER_KEY) {
    process.env.PROMPT_MASTER_KEY = Buffer.alloc(32, "test-key-pad").toString("base64");
  }
});

describe("encryptOrgCredential / decryptOrgCredential", () => {
  it("round-trips a typical token", () => {
    const plain = "glpat-EXAMPLE12345abcde";
    const enc = encryptOrgCredential(plain);
    expect(decryptOrgCredential(enc)).toBe(plain);
  });

  it("produces ciphertexts that differ each call (fresh IV)", () => {
    const plain = "secret";
    expect(encryptOrgCredential(plain)).not.toBe(encryptOrgCredential(plain));
  });

  it("throws on a malformed packed string", () => {
    expect(() => decryptOrgCredential("not.valid")).toThrow();
    expect(() => decryptOrgCredential("a.b.c")).toThrow();
  });

  it("rejects a tampered ciphertext (GCM tag mismatch)", () => {
    const enc = encryptOrgCredential("hello");
    const [iv, tag, ct] = enc.split(".");
    // Flip a byte in the ciphertext.
    const tampered = Buffer.from(ct, "base64");
    tampered[0] = tampered[0] ^ 0x01;
    const malformed = `${iv}.${tag}.${tampered.toString("base64")}`;
    expect(() => decryptOrgCredential(malformed)).toThrow();
  });
});
