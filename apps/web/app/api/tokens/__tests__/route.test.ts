import { describe, it, expect, vi, beforeEach } from "vitest";

const requireSessionMock = vi.fn();
const logAuditMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/route-helpers", () => ({
  requireSession: requireSessionMock,
}));
vi.mock("@/lib/audit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audit")>("@/lib/audit");
  return { ...actual, logAudit: logAuditMock };
});

const insertReturningMock = vi.fn().mockResolvedValue([
  { id: "tok-1", name: "collector", createdAt: new Date("2026-05-05T00:00:00Z") },
]);

vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return {
    ...actual,
    db: {
      insert: () => ({ values: () => ({ returning: insertReturningMock }) }),
    },
  };
});

const { POST } = await import("../route");

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://x.test/api/tokens", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tokens", () => {
  beforeEach(() => {
    requireSessionMock.mockReset();
    logAuditMock.mockClear();
  });

  it("emits token.create to audit_log when a token is minted", async () => {
    requireSessionMock.mockResolvedValueOnce({ user: { id: "user-1" } });

    // Empty body -> name defaults to "collector", matching what the mock
    // insertReturningMock returns above. Keeps body and asserted metadata
    // in sync without making the mock track the .values() argument.
    const res = await POST(makeRequest({}, {
      "x-forwarded-for": "203.0.113.7",
      "user-agent": "vitest",
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toMatch(/^pm_/);
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock).toHaveBeenCalledWith({
      orgId: null,
      actorUserId: "user-1",
      action: "token.create",
      targetType: "api_token",
      targetId: "tok-1",
      metadata: { tokenName: "collector" },
      ip: "203.0.113.7",
      userAgent: "vitest",
    });
  });

  it("returns 401 and does NOT emit audit when unauthenticated", async () => {
    requireSessionMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    );
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
    expect(logAuditMock).not.toHaveBeenCalled();
  });
});
