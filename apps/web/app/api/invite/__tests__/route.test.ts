import { describe, it, expect, vi, beforeEach } from "vitest";

const requireSessionMock = vi.fn();
const requireManagerMock = vi.fn();
const logAuditMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/route-helpers", () => ({
  requireSession: requireSessionMock,
  requireManager: requireManagerMock,
}));
vi.mock("@/lib/audit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audit")>("@/lib/audit");
  return { ...actual, logAudit: logAuditMock };
});

// The route makes outbound GitHub fetches. Stub global fetch to mark the
// invitee as already a public org member so we skip the GitHub PUT path.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// We don't exercise GitHub-App branch in this test; force appConfigured -> false.
vi.mock("@/lib/github-app", () => ({
  appConfigured: () => false,
  appFetch: vi.fn(),
  installUrl: () => null,
}));

// Mock the account lookup + invitation insert.
const acctLimitMock = vi.fn().mockResolvedValue([
  { userId: "actor-1", providerId: "github", accessToken: "ghp_x" },
]);
const inviteReturningMock = vi.fn().mockResolvedValue([
  { id: "inv-1", orgId: "org-1", githubLogin: "octocat", role: "dev", status: "pending" },
]);

vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return {
    ...actual,
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: acctLimitMock }) }) }),
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({ returning: inviteReturningMock }),
        }),
      }),
    },
  };
});

const { POST } = await import("../route");

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://x.test/api/invite", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/invite", () => {
  beforeEach(() => {
    requireSessionMock.mockReset();
    requireManagerMock.mockReset();
    logAuditMock.mockClear();
    fetchMock.mockReset();
  });

  it("emits invite.send to audit_log on a successful invite", async () => {
    requireSessionMock.mockResolvedValueOnce({ user: { id: "actor-1" } });
    requireManagerMock.mockResolvedValueOnce({
      org: { id: "org-1", slug: "acme", name: "Acme", githubAppInstallationId: null },
      role: "manager",
    });
    // /users/octocat -> 200, then /orgs/acme/members/octocat -> 204 (already member).
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: "octocat", id: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const res = await POST(makeRequest({
      orgSlug: "acme", githubLogin: "octocat", role: "dev",
    }, { "x-forwarded-for": "203.0.113.7", "user-agent": "vitest" }));

    expect(res.status).toBe(200);
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock).toHaveBeenCalledWith({
      orgId: "org-1",
      actorUserId: "actor-1",
      action: "invite.send",
      targetType: "invitation",
      targetId: "inv-1",
      metadata: { githubLogin: "octocat", role: "dev", githubStatus: "already_member" },
      ip: "203.0.113.7",
      userAgent: "vitest",
    });
  });

  it("does NOT emit audit when requireManager rejects", async () => {
    requireSessionMock.mockResolvedValueOnce({ user: { id: "actor-1" } });
    requireManagerMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "not a manager" }), { status: 403 }),
    );

    const res = await POST(makeRequest({ orgSlug: "acme", githubLogin: "octocat" }));
    expect(res.status).toBe(403);
    expect(logAuditMock).not.toHaveBeenCalled();
  });
});
