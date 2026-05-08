import { describe, it, expect } from "vitest";
import { getProvider, ProviderError, mapHttpStatusToProviderError } from "@/lib/providers";

describe("getProvider", () => {
  it("returns the github provider with the full interface", () => {
    const p = getProvider("github");
    expect(typeof p.listConnectableOrgs).toBe("function");
    expect(typeof p.connectOrg).toBe("function");
    expect(typeof p.inviteMember).toBe("function");
    expect(typeof p.fetchChangeRequests).toBe("function");
    expect(typeof p.resolveMember).toBe("function");
  });

  it("returns the gitlab provider with the full interface", () => {
    const p = getProvider("gitlab");
    expect(typeof p.listConnectableOrgs).toBe("function");
    expect(typeof p.connectOrg).toBe("function");
    expect(typeof p.inviteMember).toBe("function");
    expect(typeof p.fetchChangeRequests).toBe("function");
    expect(typeof p.resolveMember).toBe("function");
  });

  it("returns distinct provider instances", () => {
    expect(getProvider("github")).not.toBe(getProvider("gitlab"));
  });
});

describe("mapHttpStatusToProviderError", () => {
  it("maps 401 to expired_credential", () => {
    const err = mapHttpStatusToProviderError(401);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe("expired_credential");
  });

  it("maps 403 to permission_denied", () => {
    expect(mapHttpStatusToProviderError(403).code).toBe("permission_denied");
  });

  it("maps 404 to not_found", () => {
    expect(mapHttpStatusToProviderError(404).code).toBe("not_found");
  });

  it("maps 429 to rate_limited and parses Retry-After", () => {
    const err = mapHttpStatusToProviderError(429, "60");
    expect(err.code).toBe("rate_limited");
    expect(err.retryAfterSec).toBe(60);
  });

  it("maps 500 (and other) to unknown", () => {
    expect(mapHttpStatusToProviderError(500).code).toBe("unknown");
  });
});
