import { describe, it, expect, vi, beforeEach } from "vitest";
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

// Mock the db module BEFORE importing logAudit. The mock factory must
// return both `db` and `schema` because lib/audit.ts imports both.
const insertValuesMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return {
    ...actual,
    db: {
      insert: () => ({ values: insertValuesMock }),
    },
  };
});

// Import AFTER vi.mock is set up.
const { logAudit } = await import("../audit");

describe("logAudit", () => {
  beforeEach(() => {
    insertValuesMock.mockClear();
    insertValuesMock.mockResolvedValue(undefined);
  });

  it("inserts an audit row with all provided fields", async () => {
    await logAudit({
      orgId: "org-1",
      actorUserId: "user-1",
      action: "role.change",
      targetType: "membership",
      targetId: "user-2",
      metadata: { fromRole: "dev", toRole: "manager" },
      ip: "203.0.113.7",
      userAgent: "vitest/1.0",
    });
    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledWith({
      orgId: "org-1",
      actorUserId: "user-1",
      action: "role.change",
      targetType: "membership",
      targetId: "user-2",
      metadata: { fromRole: "dev", toRole: "manager" },
      ip: "203.0.113.7",
      userAgent: "vitest/1.0",
    });
  });

  it("defaults metadata to {} and nullable fields to null", async () => {
    await logAudit({ action: "token.create", actorUserId: "user-1" });
    expect(insertValuesMock).toHaveBeenCalledWith({
      orgId: null,
      actorUserId: "user-1",
      action: "token.create",
      targetType: null,
      targetId: null,
      metadata: {},
      ip: null,
      userAgent: null,
    });
  });

  it("swallows DB failures without throwing", async () => {
    insertValuesMock.mockRejectedValueOnce(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      logAudit({ action: "role.change", actorUserId: "user-1" })
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
