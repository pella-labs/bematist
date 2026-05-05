import { describe, it, expect, vi, beforeEach } from "vitest";

const requireSessionMock = vi.fn();
const requireManagerMock = vi.fn();
// logAuditMock wraps the real logAudit so db.insert for audit_log is still
// exercised through the db mock, while also letting us assert the call args.
const logAuditMock = vi.fn().mockImplementation(async (event: import("@/lib/audit").AuditEvent) => {
  const { logAudit: realLogAudit } = await vi.importActual<typeof import("@/lib/audit")>("@/lib/audit");
  return realLogAudit(event);
});

vi.mock("@/lib/route-helpers", () => ({
  requireSession: requireSessionMock,
  requireManager: requireManagerMock,
}));
vi.mock("@/lib/audit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audit")>("@/lib/audit");
  return { ...actual, logAudit: logAuditMock };
});

const updateWhereMock = vi.fn().mockResolvedValue(undefined);
const insertValuesMock = vi.fn().mockResolvedValue(undefined);
const selectLimitMock = vi.fn();
const selectMembersMock = vi.fn();

vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return {
    ...actual,
    db: {
      select: vi.fn().mockImplementation(() => {
        // Two distinct .select() calls in the route: target lookup, then manager-count.
        const calls = (db as any).select.mock.calls.length;
        if (calls === 1) {
          return { from: () => ({ where: () => ({ limit: selectLimitMock }) }) };
        }
        return { from: () => ({ where: selectMembersMock }) };
      }),
      update: () => ({ set: () => ({ where: updateWhereMock }) }),
      insert: () => ({ values: insertValuesMock }),
    },
  };
});

// Re-import db so our mock is the one referenced.
const { db } = await import("@/lib/db");
const { POST } = await import("../route");

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://x.test/api/membership/role", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/membership/role", () => {
  beforeEach(() => {
    requireSessionMock.mockReset();
    requireManagerMock.mockReset();
    logAuditMock.mockClear();
    insertValuesMock.mockClear();
    selectLimitMock.mockReset();
    selectMembersMock.mockReset();
    (db as any).select.mockClear?.();
  });

  it("writes to audit_log and membership_audit on a successful role change", async () => {
    requireSessionMock.mockResolvedValueOnce({ user: { id: "actor-1" } });
    requireManagerMock.mockResolvedValueOnce({
      org: { id: "org-1", slug: "acme", name: "Acme" },
      role: "manager",
    });
    selectLimitMock.mockResolvedValueOnce([{ userId: "target-1", orgId: "org-1", role: "dev" }]);
    // Manager-count check is not reached on a dev->manager promotion.

    const res = await POST(makeRequest({
      orgSlug: "acme", targetUserId: "target-1", role: "manager",
    }, { "x-forwarded-for": "203.0.113.7", "user-agent": "vitest" }));

    expect(res.status).toBe(200);
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock).toHaveBeenCalledWith({
      orgId: "org-1",
      actorUserId: "actor-1",
      action: "role.change",
      targetType: "membership",
      targetId: "target-1",
      metadata: { fromRole: "dev", toRole: "manager" },
      ip: "203.0.113.7",
      userAgent: "vitest",
    });
    // membership_audit insert still happens (we don't break the existing UI).
    expect(insertValuesMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT emit audit when requireManager rejects", async () => {
    requireSessionMock.mockResolvedValueOnce({ user: { id: "actor-1" } });
    requireManagerMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "not a manager" }), { status: 403 }),
    );

    const res = await POST(makeRequest({
      orgSlug: "acme", targetUserId: "target-1", role: "manager",
    }));
    expect(res.status).toBe(403);
    expect(logAuditMock).not.toHaveBeenCalled();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });
});
