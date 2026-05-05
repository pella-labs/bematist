import { describe, it, expect } from "vitest";
import { extractRequestMeta } from "../audit";

describe("extractRequestMeta", () => {
  it("returns user-agent from header", () => {
    const req = new Request("http://x.test", {
      headers: { "user-agent": "vitest/1.0" },
    });
    expect(extractRequestMeta(req)).toEqual({ ip: null, userAgent: "vitest/1.0" });
  });

  it("returns first IP from x-forwarded-for", () => {
    const req = new Request("http://x.test", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    expect(extractRequestMeta(req).ip).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = new Request("http://x.test", {
      headers: { "x-real-ip": "203.0.113.42" },
    });
    expect(extractRequestMeta(req).ip).toBe("203.0.113.42");
  });

  it("returns null ip and null user-agent when both missing", () => {
    const req = new Request("http://x.test");
    expect(extractRequestMeta(req)).toEqual({ ip: null, userAgent: null });
  });
});
