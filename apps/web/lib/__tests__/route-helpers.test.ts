import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth + db before importing the helpers.
const getSessionMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: getSessionMock } },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

// Mock the db. requireManager runs a join against membership + org.
// We mock the chained query builder. Each test sets the resolved value.
const limitMock = vi.fn();
vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return {
    ...actual,
    db: {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({ limit: limitMock }),
          }),
        }),
      }),
    },
  };
});

const { requireSession } = await import("../route-helpers");
const { requireManager } = await import("../route-helpers");

describe("requireSession", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
  });

  it("returns a 401 NextResponse when no session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    const result = await requireSession();
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
      const body = await result.json();
      expect(body.error).toBe("unauthorized");
    }
  });

  it("returns a 401 NextResponse when session has no user", async () => {
    getSessionMock.mockResolvedValueOnce({ user: null });
    const result = await requireSession();
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) expect(result.status).toBe(401);
  });

  it("returns the session user when authenticated", async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: "user-1", email: "a@b.c" } });
    const result = await requireSession();
    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.user.id).toBe("user-1");
    }
  });
});

describe("requireManager", () => {
  beforeEach(() => {
    limitMock.mockReset();
  });

  it("returns 404 when the user has no membership in that org", async () => {
    limitMock.mockResolvedValueOnce([]);
    const result = await requireManager("user-1", "acme");
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(404);
    }
  });

  it("returns 403 when the user is a member but not a manager", async () => {
    limitMock.mockResolvedValueOnce([
      { org: { id: "org-1", slug: "acme", name: "Acme" }, role: "dev" },
    ]);
    const result = await requireManager("user-1", "acme");
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(403);
    }
  });

  it("returns the org when the user is a manager", async () => {
    limitMock.mockResolvedValueOnce([
      { org: { id: "org-1", slug: "acme", name: "Acme" }, role: "manager" },
    ]);
    const result = await requireManager("user-1", "acme");
    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.org.id).toBe("org-1");
      expect(result.role).toBe("manager");
    }
  });
});
