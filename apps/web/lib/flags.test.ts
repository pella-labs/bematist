import { expect, test } from "bun:test";
import { isComplianceEnabled } from "./flags";

function withFlag<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.BEMATIST_COMPLIANCE_ENABLED;
  try {
    if (value === undefined) delete process.env.BEMATIST_COMPLIANCE_ENABLED;
    else process.env.BEMATIST_COMPLIANCE_ENABLED = value;
    return fn();
  } finally {
    if (prev === undefined) delete process.env.BEMATIST_COMPLIANCE_ENABLED;
    else process.env.BEMATIST_COMPLIANCE_ENABLED = prev;
  }
}

test("isComplianceEnabled defaults to true when env var is unset", () => {
  withFlag(undefined, () => {
    expect(isComplianceEnabled()).toBe(true);
  });
});

test("isComplianceEnabled returns true for empty string (treated as unset)", () => {
  withFlag("", () => {
    expect(isComplianceEnabled()).toBe(true);
  });
});

test("isComplianceEnabled returns true for '1'", () => {
  withFlag("1", () => {
    expect(isComplianceEnabled()).toBe(true);
  });
});

test("isComplianceEnabled returns true for 'true'", () => {
  withFlag("true", () => {
    expect(isComplianceEnabled()).toBe(true);
  });
});

test("isComplianceEnabled returns false for '0'", () => {
  withFlag("0", () => {
    expect(isComplianceEnabled()).toBe(false);
  });
});

test("isComplianceEnabled returns false for 'false'", () => {
  withFlag("false", () => {
    expect(isComplianceEnabled()).toBe(false);
  });
});

test("isComplianceEnabled treats unknown values as enabled (fail-safe)", () => {
  withFlag("abc", () => {
    expect(isComplianceEnabled()).toBe(true);
  });
});

test("isComplianceEnabled is case-sensitive — 'FALSE' does NOT disable", () => {
  withFlag("FALSE", () => {
    expect(isComplianceEnabled()).toBe(true);
  });
});
