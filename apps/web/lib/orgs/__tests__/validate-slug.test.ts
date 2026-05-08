import { describe, it, expect } from "vitest";

// We test the pure prefix logic directly — DB integration is covered by the
// connect-flow integration tests in Phase 4.

function isPrefixOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  return longer === shorter || longer.startsWith(shorter + "/");
}

describe("isPrefixOverlap", () => {
  it("treats identical slugs as overlap", () => {
    expect(isPrefixOverlap("acme", "acme")).toBe(true);
  });

  it("flags parent/child as overlap", () => {
    expect(isPrefixOverlap("acme", "acme/platform")).toBe(true);
    expect(isPrefixOverlap("acme/platform", "acme")).toBe(true);
    expect(isPrefixOverlap("acme/a", "acme/a/b")).toBe(true);
  });

  it("does not flag siblings as overlap", () => {
    expect(isPrefixOverlap("acme/a", "acme/b")).toBe(false);
    expect(isPrefixOverlap("acme/team-a", "acme/team-b")).toBe(false);
  });

  it("does not flag distinct top-levels as overlap", () => {
    expect(isPrefixOverlap("acme", "acme-corp")).toBe(false);
    expect(isPrefixOverlap("acme", "other")).toBe(false);
  });

  it("does not flag substring-but-not-prefix as overlap", () => {
    expect(isPrefixOverlap("acme/platform", "acme/platform-eng")).toBe(false);
  });

  it("handles deep nesting", () => {
    expect(isPrefixOverlap("a/b/c", "a/b/c/d")).toBe(true);
    expect(isPrefixOverlap("a/b/c/d", "a/b/c/e")).toBe(false);
  });
});
