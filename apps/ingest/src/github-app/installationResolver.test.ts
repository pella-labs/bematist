import { describe, expect, test } from "bun:test";
import {
  createInMemoryInstallationResolver,
  type InstallationRecord,
} from "./installationResolver";

function rec(overrides: Partial<InstallationRecord> = {}): InstallationRecord {
  return {
    tenant_id: "00000000-0000-0000-0000-000000000001",
    installation_id: 42424242n,
    github_org_id: 123456n,
    github_org_login: "fixture-org",
    app_id: 909090n,
    status: "active",
    token_ref: "tok:t",
    webhook_secret_active_ref: "ws:a",
    webhook_secret_previous_ref: null,
    webhook_secret_rotated_at: null,
    ...overrides,
  };
}

describe("InMemoryInstallationResolver", () => {
  test("byInstallationId returns null on miss", async () => {
    const r = createInMemoryInstallationResolver();
    expect(await r.byInstallationId(999n)).toBeNull();
  });

  test("seed + lookup + status update round-trip", async () => {
    const r = createInMemoryInstallationResolver();
    r.seed(rec());
    const got = await r.byInstallationId(42424242n);
    expect(got?.status).toBe("active");
    r.setStatus(42424242n, "suspended");
    const after = await r.byInstallationId(42424242n);
    expect(after?.status).toBe("suspended");
  });

  test("rotate overwrites active/previous refs + rotated_at atomically", async () => {
    const r = createInMemoryInstallationResolver();
    r.seed(rec());
    const at = new Date("2026-04-18T00:00:00Z");
    r.rotate(42424242n, {
      active_ref: "ws:new",
      previous_ref: "ws:a",
      rotated_at: at,
    });
    const got = await r.byInstallationId(42424242n);
    expect(got?.webhook_secret_active_ref).toBe("ws:new");
    expect(got?.webhook_secret_previous_ref).toBe("ws:a");
    expect(got?.webhook_secret_rotated_at?.getTime()).toBe(at.getTime());
  });

  test("lookup returns a defensive copy (mutating result does not leak into the store)", async () => {
    const r = createInMemoryInstallationResolver();
    r.seed(rec());
    const a = await r.byInstallationId(42424242n);
    if (!a) throw new Error("unreachable");
    a.status = "revoked";
    const b = await r.byInstallationId(42424242n);
    expect(b?.status).toBe("active");
  });
});
