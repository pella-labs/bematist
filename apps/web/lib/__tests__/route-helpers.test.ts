import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth + db before importing the helpers.
const getSessionMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: getSessionMock } },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

const { requireSession } = await import("../route-helpers");

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
