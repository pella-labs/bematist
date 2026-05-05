# Audit Log + Role-Check Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a single, queryable `audit_log` table and centralized session/manager helpers so every privileged action is recorded consistently and every manager-only route shares one role-check implementation.

**Architecture:** Add a new `audit_log` Postgres table (alongside, not replacing, the existing `membership_audit`). Introduce `lib/audit.ts` (logger + request-meta extractor) and `lib/route-helpers.ts` (`requireSession`, `requireManager`) that any route can call. Migrate the three privileged routes (`/api/membership/role`, `/api/invite`, `/api/tokens`) to use the helpers and emit audit events. The existing `/org/[slug]/members` UI continues to read `membership_audit` unchanged — a dedicated audit-log UI is a separate plan.

**Tech Stack:** Drizzle ORM, Postgres, Next.js 16 App Router, better-auth, Vitest (unit tests with `vi.mock`).

**Out of scope (deferred to follow-up plans):**
- Standalone manager-visible `/org/[slug]/audit` page.
- Migration of `/api/github-app/install`, `/api/orgs`, `/api/invite/accept`, `/api/card/*` routes — those are not manager-only privileged actions.
- Adding token revocation routes (`DELETE /api/tokens/:id`) — currently no revocation route exists; we only log creation.
- Eventual cutover of `members/page.tsx` to read from `audit_log` instead of `membership_audit`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `apps/web/lib/db/schema.ts` | Modify | Add `auditLog` pgTable definition + index |
| `apps/web/lib/audit.ts` | Create | `logAudit()` writer (never throws), `extractRequestMeta()` pure helper, `AuditAction` type union |
| `apps/web/lib/route-helpers.ts` | Create | `requireSession()` and `requireManager()` — return either resolved context or a `NextResponse` error |
| `apps/web/lib/__tests__/audit.test.ts` | Create | Unit tests for `extractRequestMeta` + `logAudit` (success + swallow-on-failure) |
| `apps/web/lib/__tests__/route-helpers.test.ts` | Create | Unit tests for `requireSession` (401, success) + `requireManager` (401, 403, 404, success) |
| `apps/web/app/api/membership/role/route.ts` | Modify | Use `requireSession` + `requireManager`, write to BOTH `membership_audit` and `audit_log` |
| `apps/web/app/api/invite/route.ts` | Modify | Replace inline `requireManager` with the shared helper, emit `invite.send` to `audit_log` on POST |
| `apps/web/app/api/tokens/route.ts` | Modify | Use `requireSession`, emit `token.create` to `audit_log` on POST |
| `apps/web/app/api/membership/role/__tests__/route.test.ts` | Create | One regression test asserting role change inserts into `audit_log` |
| `apps/web/app/api/invite/__tests__/route.test.ts` | Create | One regression test asserting successful invite inserts into `audit_log` |
| `apps/web/app/api/tokens/__tests__/route.test.ts` | Create | One regression test asserting token creation inserts into `audit_log` |

**Why this split:**
- `lib/audit.ts` and `lib/route-helpers.ts` are separate because they have separate failure modes (logging is best-effort and never throws; role checks are correctness-critical and short-circuit the response). Mixing them would force callers to reason about both at once.
- Tests for the helpers live in `lib/__tests__/` (matches existing repo convention — see `lib/__tests__/aggregate.test.ts`).
- Tests for the routes live next to the routes (`app/api/.../__tests__/`) because vitest's `include: ["**/*.test.ts"]` already picks them up; this keeps the test physically near the code under test.

---

## Conventions used throughout this plan

**Action names** (`audit_log.action` column) use `dot.case`:
- `role.change` — manager promoted/demoted another member
- `invite.send` — manager invited a GitHub user to the org
- `token.create` — user minted a collector API token

**Commit message style:** Conventional Commits (matches repo) — e.g., `feat(web): add audit_log table`. Each commit ends with the `Co-Authored-By` trailer per the repo's commit rule.

**Run tests with:** `cd apps/web && bunx vitest run <file>` for one file, or `bun run test` from repo root for all.

---

## Task 1: Add `audit_log` table to schema

**Files:**
- Modify: `apps/web/lib/db/schema.ts` (append new table after `uploadBatch`, around line 252)

- [ ] **Step 1.1: Add the `auditLog` table definition**

Open `apps/web/lib/db/schema.ts`. After the `uploadBatch` declaration (the last table), append:

```ts
// ---------- audit log ----------
// Append-only record of every privileged action (token mint, invite send,
// role change, etc). Read by managers; written by `lib/audit.ts`.
// `orgId` and `actorUserId` are nullable because some events (future:
// org.create, account.delete) may not have one or the other.
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => org.id, { onDelete: "set null" }),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  action: text("action").notNull(),                 // e.g. "role.change", "invite.send", "token.create"
  targetType: text("target_type"),                  // e.g. "membership", "invitation", "api_token"
  targetId: text("target_id"),                      // free-form id of the affected row
  metadata: jsonb("metadata").notNull().default({}),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, t => ({
  byOrg: index("audit_log_by_org").on(t.orgId, t.createdAt),
  byActor: index("audit_log_by_actor").on(t.actorUserId, t.createdAt),
  byAction: index("audit_log_by_action").on(t.action, t.createdAt),
}));
```

- [ ] **Step 1.2: Apply schema to local Postgres**

Run from repo root:

```bash
bun run db:push
```

Expected: drizzle-kit prints `Changes applied` (or similar) and creates the `audit_log` table plus three indexes. If it asks to confirm, answer yes — this is a pure additive change.

- [ ] **Step 1.3: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 1.4: Commit**

```bash
git add apps/web/lib/db/schema.ts
git commit -m "$(cat <<'EOF'
feat(web): add audit_log table for privileged-action tracking

Append-only log written by lib/audit.ts. Indexed by org, actor, and
action for queryability. FK ON DELETE SET NULL so deleting a user/org
preserves the historical trail.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Implement `extractRequestMeta` (pure helper, TDD)

**Files:**
- Create: `apps/web/lib/audit.ts`
- Create: `apps/web/lib/__tests__/audit.test.ts`

- [ ] **Step 2.1: Write the failing test**

Create `apps/web/lib/__tests__/audit.test.ts`:

```ts
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
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
cd apps/web && bunx vitest run lib/__tests__/audit.test.ts
```

Expected: FAIL — `Cannot find module '../audit'`.

- [ ] **Step 2.3: Create `lib/audit.ts` with `extractRequestMeta`**

Create `apps/web/lib/audit.ts`:

```ts
// Audit log helper. Never throws — a failure to log must not break the parent
// request. Read in tandem with apps/web/lib/db/schema.ts (auditLog table).

export type AuditAction =
  | "role.change"
  | "invite.send"
  | "token.create";

export interface AuditEvent {
  orgId?: string | null;
  actorUserId?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Extract caller IP and User-Agent from a Request. Railway sets
 * `x-forwarded-for` (first hop = the real client). We also accept
 * `x-real-ip` as a fallback for non-Railway deployments.
 */
export function extractRequestMeta(req: Request): RequestMeta {
  const xff = req.headers.get("x-forwarded-for");
  let ip: string | null = null;
  if (xff) {
    ip = xff.split(",")[0]!.trim() || null;
  } else {
    ip = req.headers.get("x-real-ip");
  }
  const userAgent = req.headers.get("user-agent");
  return { ip, userAgent };
}
```

- [ ] **Step 2.4: Run test to verify it passes**

```bash
cd apps/web && bunx vitest run lib/__tests__/audit.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add apps/web/lib/audit.ts apps/web/lib/__tests__/audit.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add extractRequestMeta + AuditEvent types

Pure helper that pulls client IP (x-forwarded-for first, x-real-ip
fallback) and user-agent off a Request. Used by logAudit (next).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Implement `logAudit`

**Files:**
- Modify: `apps/web/lib/audit.ts`
- Modify: `apps/web/lib/__tests__/audit.test.ts`

- [ ] **Step 3.1: Write the failing test for the success path**

Append to `apps/web/lib/__tests__/audit.test.ts`:

```ts
import { vi, beforeEach } from "vitest";

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
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
cd apps/web && bunx vitest run lib/__tests__/audit.test.ts
```

Expected: 3 new tests fail with `logAudit is not a function`.

- [ ] **Step 3.3: Implement `logAudit`**

Append to `apps/web/lib/audit.ts`:

```ts
import { db, schema } from "@/lib/db";

/**
 * Insert one audit_log row. Best-effort: a logging failure logs to
 * console.error and resolves — it never throws. Reason: a logging
 * outage must not 500 a user request.
 */
export async function logAudit(event: AuditEvent): Promise<void> {
  try {
    await db.insert(schema.auditLog).values({
      orgId: event.orgId ?? null,
      actorUserId: event.actorUserId ?? null,
      action: event.action,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      metadata: event.metadata ?? {},
      ip: event.ip ?? null,
      userAgent: event.userAgent ?? null,
    });
  } catch (err) {
    console.error("logAudit failed", { action: event.action, err });
  }
}
```

- [ ] **Step 3.4: Run test to verify it passes**

```bash
cd apps/web && bunx vitest run lib/__tests__/audit.test.ts
```

Expected: all 7 tests in the file pass.

- [ ] **Step 3.5: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3.6: Commit**

```bash
git add apps/web/lib/audit.ts apps/web/lib/__tests__/audit.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add logAudit with swallow-on-failure semantics

Best-effort writer to audit_log. A logging outage must not 500 a user
request, so DB errors are logged to console and the promise resolves.
Tests cover success, default-fill of optional fields, and the swallow
path.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implement `requireSession`

**Files:**
- Create: `apps/web/lib/route-helpers.ts`
- Create: `apps/web/lib/__tests__/route-helpers.test.ts`

- [ ] **Step 4.1: Write the failing tests**

Create `apps/web/lib/__tests__/route-helpers.test.ts`:

```ts
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
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
cd apps/web && bunx vitest run lib/__tests__/route-helpers.test.ts
```

Expected: FAIL — `Cannot find module '../route-helpers'`.

- [ ] **Step 4.3: Create `lib/route-helpers.ts` with `requireSession`**

Create `apps/web/lib/route-helpers.ts`:

```ts
// Centralized auth helpers for route handlers. Each helper returns
// either the resolved context object OR a NextResponse error to return
// directly. Callers do an `instanceof Response` check.
//
// Pattern (in a route):
//   const sess = await requireSession();
//   if (sess instanceof Response) return sess;
//   // ... use sess.user
//
// Or for manager-only routes:
//   const sess = await requireSession();
//   if (sess instanceof Response) return sess;
//   const mgr = await requireManager(sess, body.orgSlug);
//   if (mgr instanceof Response) return mgr;
//   // ... use mgr.org

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export interface SessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
}

export interface SessionContext {
  user: SessionUser;
}

export async function requireSession(): Promise<SessionContext | NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return { user: session.user as SessionUser };
}
```

- [ ] **Step 4.4: Run test to verify it passes**

```bash
cd apps/web && bunx vitest run lib/__tests__/route-helpers.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add apps/web/lib/route-helpers.ts apps/web/lib/__tests__/route-helpers.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add requireSession route helper

Returns either { user } or a 401 NextResponse. Callers use the
instanceof Response pattern to short-circuit. Centralizing this so
new routes don't reinvent the auth check.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Implement `requireManager`

**Files:**
- Modify: `apps/web/lib/route-helpers.ts`
- Modify: `apps/web/lib/__tests__/route-helpers.test.ts`

- [ ] **Step 5.1: Write the failing tests**

Append to `apps/web/lib/__tests__/route-helpers.test.ts`:

```ts
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

const { requireManager } = await import("../route-helpers");

describe("requireManager", () => {
  beforeEach(() => {
    limitMock.mockReset();
  });

  const fakeSession = { user: { id: "user-1" } };

  it("returns 404 when the user has no membership in that org", async () => {
    limitMock.mockResolvedValueOnce([]);
    const result = await requireManager(fakeSession, "acme");
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(404);
    }
  });

  it("returns 403 when the user is a member but not a manager", async () => {
    limitMock.mockResolvedValueOnce([
      { org: { id: "org-1", slug: "acme", name: "Acme" }, role: "dev" },
    ]);
    const result = await requireManager(fakeSession, "acme");
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(403);
    }
  });

  it("returns the org when the user is a manager", async () => {
    limitMock.mockResolvedValueOnce([
      { org: { id: "org-1", slug: "acme", name: "Acme" }, role: "manager" },
    ]);
    const result = await requireManager(fakeSession, "acme");
    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.org.id).toBe("org-1");
      expect(result.role).toBe("manager");
    }
  });
});
```

- [ ] **Step 5.2: Run test to verify it fails**

```bash
cd apps/web && bunx vitest run lib/__tests__/route-helpers.test.ts
```

Expected: 3 new tests fail with `requireManager is not a function`.

- [ ] **Step 5.3: Implement `requireManager`**

Append to `apps/web/lib/route-helpers.ts`:

```ts
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";

export type OrgRow = typeof schema.org.$inferSelect;

export interface ManagerContext {
  org: OrgRow;
  role: "manager";
}

/**
 * Verify the session user is a manager of `orgSlug`. Pass the
 * SessionContext from requireSession() — the type signature enforces
 * that requireSession() ran first, so `session.user.id` is always a
 * verified id (not a user-controlled body field).
 *
 * Returns:
 *   - 404 if the user has no membership in any org with that slug
 *   - 403 if the user is a member but role !== "manager"
 *   - { org, role } when authorized
 */
export async function requireManager(
  session: SessionContext,
  orgSlug: string,
): Promise<ManagerContext | NextResponse> {
  const [row] = await db
    .select({ org: schema.org, role: schema.membership.role })
    .from(schema.membership)
    .innerJoin(schema.org, eq(schema.membership.orgId, schema.org.id))
    .where(and(eq(schema.membership.userId, session.user.id), eq(schema.org.slug, orgSlug)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "not a member of this org" }, { status: 404 });
  }
  if (row.role !== "manager") {
    return NextResponse.json({ error: "not a manager of this org" }, { status: 403 });
  }
  return { org: row.org, role: "manager" };
}
```

- [ ] **Step 5.4: Run test to verify it passes**

```bash
cd apps/web && bunx vitest run lib/__tests__/route-helpers.test.ts
```

Expected: all 6 tests in the file pass.

- [ ] **Step 5.5: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 5.6: Commit**

```bash
git add apps/web/lib/route-helpers.ts apps/web/lib/__tests__/route-helpers.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add requireManager route helper

Single source of truth for the membership+role check that's currently
duplicated across /api/invite and /api/membership/role. Returns 404 vs
403 distinctly so we don't leak whether an org slug exists to non-
members.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Migrate `/api/membership/role` and emit `role.change`

**Files:**
- Modify: `apps/web/app/api/membership/role/route.ts`
- Create: `apps/web/app/api/membership/role/__tests__/route.test.ts`

- [ ] **Step 6.1: Write the failing test**

Create `apps/web/app/api/membership/role/__tests__/route.test.ts`:

```ts
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
```

- [ ] **Step 6.2: Run test to verify it fails**

```bash
cd apps/web && bunx vitest run app/api/membership/role/__tests__/route.test.ts
```

Expected: FAIL — the existing route doesn't import `requireSession`/`requireManager`/`logAudit`, so the test asserts `logAuditMock` was called but it wasn't.

- [ ] **Step 6.3: Replace `apps/web/app/api/membership/role/route.ts` with the migrated version**

Open `apps/web/app/api/membership/role/route.ts` and replace its entire contents with:

```ts
// POST /api/membership/role  { orgSlug, targetUserId, role: "manager" | "dev" }
// Manager-only. Cannot demote yourself. Cannot demote the last remaining manager.

import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireManager } from "@/lib/route-helpers";
import { logAudit, extractRequestMeta } from "@/lib/audit";

const bodySchema = z.object({
  orgSlug: z.string(),
  targetUserId: z.string().min(1),
  role: z.enum(["manager", "dev"]),
});

export async function POST(req: Request) {
  const sess = await requireSession();
  if (sess instanceof Response) return sess;

  const body = bodySchema.parse(await req.json());

  const mgr = await requireManager(sess, body.orgSlug);
  if (mgr instanceof Response) return mgr;

  if (sess.user.id === body.targetUserId) {
    return NextResponse.json({ error: "you can't change your own role" }, { status: 400 });
  }

  const [target] = await db.select().from(schema.membership)
    .where(and(eq(schema.membership.userId, body.targetUserId), eq(schema.membership.orgId, mgr.org.id)))
    .limit(1);
  if (!target) return NextResponse.json({ error: "target is not a member of this org" }, { status: 404 });

  if (target.role === body.role) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  if (target.role === "manager" && body.role === "dev") {
    const managers = await db.select({ userId: schema.membership.userId })
      .from(schema.membership)
      .where(and(eq(schema.membership.orgId, mgr.org.id), eq(schema.membership.role, "manager")));
    if (managers.length <= 1) {
      return NextResponse.json({ error: "can't demote the last manager" }, { status: 400 });
    }
  }

  await db.update(schema.membership)
    .set({ role: body.role })
    .where(and(eq(schema.membership.userId, body.targetUserId), eq(schema.membership.orgId, mgr.org.id)));

  // Keep writing to membership_audit so /org/[slug]/members continues to render
  // role-change history without a separate UI change. A follow-up plan migrates
  // that page to read from audit_log and we can drop this dual-write.
  // Wrapped in try/catch matching logAudit's swallow-on-failure semantics: a
  // legacy-audit hiccup must not 500 a request whose role mutation already
  // succeeded.
  try {
    await db.insert(schema.membershipAudit).values({
      orgId: mgr.org.id,
      targetUserId: body.targetUserId,
      actorUserId: sess.user.id,
      fromRole: target.role,
      toRole: body.role,
    });
  } catch (err) {
    console.error("membership_audit insert failed", { orgId: mgr.org.id, targetUserId: body.targetUserId, err });
  }

  const meta = extractRequestMeta(req);
  await logAudit({
    orgId: mgr.org.id,
    actorUserId: sess.user.id,
    action: "role.change",
    targetType: "membership",
    targetId: body.targetUserId,
    metadata: { fromRole: target.role, toRole: body.role },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6.4: Run the test to verify it passes**

```bash
cd apps/web && bunx vitest run app/api/membership/role/__tests__/route.test.ts
```

Expected: 1 test passes.

- [ ] **Step 6.5: Run the full vitest suite to confirm no regressions**

```bash
cd apps/web && bunx vitest run
```

Expected: all tests pass (the existing aggregate / pricing / ingest-schema tests are untouched).

- [ ] **Step 6.6: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 6.7: Commit**

```bash
git add apps/web/app/api/membership/role/route.ts apps/web/app/api/membership/role/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
feat(web): wire /api/membership/role through requireManager + audit_log

Replaces the inline session/role check with the shared helpers and adds
a role.change audit_log row alongside the existing membership_audit
write. The dual-write is intentional — /org/[slug]/members still reads
membership_audit, and we'll cut that over in a follow-up plan.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Migrate `/api/invite` and emit `invite.send`

**Files:**
- Modify: `apps/web/app/api/invite/route.ts`
- Create: `apps/web/app/api/invite/__tests__/route.test.ts`

- [ ] **Step 7.1: Write the failing test**

Create `apps/web/app/api/invite/__tests__/route.test.ts`:

```ts
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
```

- [ ] **Step 7.2: Run test to verify it fails**

```bash
cd apps/web && bunx vitest run app/api/invite/__tests__/route.test.ts
```

Expected: FAIL — the existing route doesn't call `requireSession` / `requireManager` / `logAudit`.

- [ ] **Step 7.3: Replace `apps/web/app/api/invite/route.ts` with the migrated version**

Replace the entire file contents with:

```ts
// POST /api/invite     { orgSlug, githubLogin }  — manager only
// GET  /api/invite     ?orgSlug=... — list pending invites in org

import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appFetch, appConfigured, installUrl } from "@/lib/github-app";
import { requireSession, requireManager } from "@/lib/route-helpers";
import { logAudit, extractRequestMeta } from "@/lib/audit";

export async function GET(req: Request) {
  const sess = await requireSession();
  if (sess instanceof Response) return sess;

  const { searchParams } = new URL(req.url);
  const orgSlug = searchParams.get("orgSlug");
  if (!orgSlug) return NextResponse.json({ error: "orgSlug required" }, { status: 400 });

  const mgr = await requireManager(sess, orgSlug);
  if (mgr instanceof Response) return mgr;

  const invites = await db.select().from(schema.invitation).where(eq(schema.invitation.orgId, mgr.org.id));
  return NextResponse.json({ invites });
}

const inviteSchema = z.object({
  orgSlug: z.string(),
  githubLogin: z.string().min(1),
  role: z.enum(["manager", "dev"]).default("dev"),
});

export async function POST(req: Request) {
  const sess = await requireSession();
  if (sess instanceof Response) return sess;

  const body = inviteSchema.parse(await req.json());

  const mgr = await requireManager(sess, body.orgSlug);
  if (mgr instanceof Response) return mgr;

  // Verify invitee is actually in the GitHub org
  const [acc] = await db.select().from(schema.account)
    .where(and(eq(schema.account.userId, sess.user.id), eq(schema.account.providerId, "github")))
    .limit(1);
  if (!acc?.accessToken) return NextResponse.json({ error: "no github token" }, { status: 400 });

  const useApp = appConfigured() && mgr.org.githubAppInstallationId != null;
  const installationId = mgr.org.githubAppInstallationId as number | null;
  const typedInput = body.githubLogin.trim();

  // Look up the canonical login spelling (GitHub usernames are case-insensitive
  // at lookup; using the response value avoids inviting a typo'd account).
  const userRes = useApp
    ? await appFetch(installationId!, `/users/${typedInput}`)
    : await fetch(`https://api.github.com/users/${typedInput}`, {
        headers: { Authorization: `Bearer ${acc.accessToken}`, Accept: "application/vnd.github+json" },
      });
  if (!userRes.ok) {
    return NextResponse.json({ error: `${typedInput} is not a valid GitHub user` }, { status: 400 });
  }
  const ghUser = await userRes.json() as { login: string; id: number; type?: string };
  const login = ghUser.login;

  // Public-member check: 204 = member.
  const pub = useApp
    ? await appFetch(installationId!, `/orgs/${mgr.org.slug}/members/${login}`, { redirect: "manual" })
    : await fetch(`https://api.github.com/orgs/${mgr.org.slug}/members/${login}`, {
        headers: { Authorization: `Bearer ${acc.accessToken}`, Accept: "application/vnd.github+json" },
        redirect: "manual",
      });
  const alreadyMember = pub.status === 204;

  let github:
    | { ok: true; status: "already_member" | "invited" | "active"; via: "app" | "user" }
    | { ok: false; error: string; install_url?: string }
    | null = null;

  if (alreadyMember) {
    github = { ok: true, status: "already_member", via: useApp ? "app" : "user" };
  } else if (useApp) {
    const inviteRes = await appFetch(installationId!, `/orgs/${mgr.org.slug}/memberships/${login}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "member" }),
    });
    if (inviteRes.ok) {
      const data = await inviteRes.json().catch(() => ({} as any));
      github = { ok: true, status: data?.state === "active" ? "active" : "invited", via: "app" };
    } else {
      const data = await inviteRes.json().catch(() => ({} as any));
      github = { ok: false, error: data?.message ?? `GitHub invite failed (${inviteRes.status})` };
    }
  } else {
    const url = installUrl(mgr.org.slug);
    github = {
      ok: false,
      error: url
        ? "Install Pellametric on this GitHub org to enable invites."
        : "GitHub invites are not configured on this server.",
      ...(url ? { install_url: url } : {}),
    };
  }

  const [inv] = await db.insert(schema.invitation).values({
    orgId: mgr.org.id,
    githubLogin: login,
    invitedByUserId: sess.user.id,
    role: body.role,
  }).onConflictDoNothing().returning();

  if (inv) {
    const meta = extractRequestMeta(req);
    await logAudit({
      orgId: mgr.org.id,
      actorUserId: sess.user.id,
      action: "invite.send",
      targetType: "invitation",
      targetId: inv.id,
      metadata: {
        githubLogin: login,
        role: body.role,
        githubStatus: github?.ok ? github.status : "failed",
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  return NextResponse.json({ invitation: inv ?? null, github });
}
```

- [ ] **Step 7.4: Run the test to verify it passes**

```bash
cd apps/web && bunx vitest run app/api/invite/__tests__/route.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 7.5: Run the full vitest suite**

```bash
cd apps/web && bunx vitest run
```

Expected: all tests pass.

- [ ] **Step 7.6: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 7.7: Commit**

```bash
git add apps/web/app/api/invite/route.ts apps/web/app/api/invite/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
feat(web): wire /api/invite through requireManager + audit_log

Replaces the inline requireManager helper (now removed from this file)
with the shared one and emits invite.send to audit_log only when the
invitation row was actually created (onConflictDoNothing may return
nothing on duplicate).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Migrate `/api/tokens` and emit `token.create`

**Files:**
- Modify: `apps/web/app/api/tokens/route.ts`
- Create: `apps/web/app/api/tokens/__tests__/route.test.ts`

- [ ] **Step 8.1: Write the failing test**

Create `apps/web/app/api/tokens/__tests__/route.test.ts`:

```ts
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
```

- [ ] **Step 8.2: Run test to verify it fails**

```bash
cd apps/web && bunx vitest run app/api/tokens/__tests__/route.test.ts
```

Expected: FAIL — `logAudit` is not called.

- [ ] **Step 8.3: Replace `apps/web/app/api/tokens/route.ts` with the migrated version**

Replace the entire file contents with:

```ts
// POST /api/tokens   -> issue collector token (once, value shown once)
// GET  /api/tokens   -> list user's tokens (without plaintext)

import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireSession } from "@/lib/route-helpers";
import { logAudit, extractRequestMeta } from "@/lib/audit";

export async function GET() {
  const sess = await requireSession();
  if (sess instanceof Response) return sess;

  const rows = await db.select({
    id: schema.apiToken.id, name: schema.apiToken.name,
    createdAt: schema.apiToken.createdAt, lastUsedAt: schema.apiToken.lastUsedAt,
    revokedAt: schema.apiToken.revokedAt,
  }).from(schema.apiToken).where(eq(schema.apiToken.userId, sess.user.id));
  return NextResponse.json({ tokens: rows });
}

export async function POST(req: Request) {
  const sess = await requireSession();
  if (sess instanceof Response) return sess;

  const body = await req.json().catch(() => ({}));
  const name = (body?.name as string) || "collector";
  const plain = "pm_" + crypto.randomBytes(24).toString("base64url");
  const hash = crypto.createHash("sha256").update(plain).digest("hex");
  const [row] = await db.insert(schema.apiToken).values({
    userId: sess.user.id, name, tokenHash: hash,
  }).returning();

  const meta = extractRequestMeta(req);
  await logAudit({
    orgId: null,
    actorUserId: sess.user.id,
    action: "token.create",
    targetType: "api_token",
    targetId: row.id,
    metadata: { tokenName: row.name },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ id: row.id, token: plain, createdAt: row.createdAt });
}
```

- [ ] **Step 8.4: Run the test to verify it passes**

```bash
cd apps/web && bunx vitest run app/api/tokens/__tests__/route.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 8.5: Run the full vitest suite**

```bash
cd apps/web && bunx vitest run
```

Expected: all tests pass.

- [ ] **Step 8.6: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 8.7: Commit**

```bash
git add apps/web/app/api/tokens/route.ts apps/web/app/api/tokens/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
feat(web): wire /api/tokens through requireSession + audit_log

GET and POST now share the requireSession helper. POST emits
token.create with the new token's id as targetId. orgId is null
because tokens are user-scoped, not org-scoped.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Final pass — full repo typecheck + test, manual smoke

**Files:** none (verification only).

- [ ] **Step 9.1: Run full repo typecheck**

```bash
bun run typecheck
```

Expected: no errors across all workspaces.

- [ ] **Step 9.2: Run full repo test suite**

```bash
bun run test
```

Expected: all tests pass (web + collector workspaces).

- [ ] **Step 9.3: Build the web app to confirm Next picks up the changes**

```bash
bun --filter='./apps/web' run build
```

Expected: build completes (the static-analysis pass over route handlers must compile cleanly).

- [ ] **Step 9.4: Manual smoke (local dev)**

Start the app:

```bash
bun run dev
```

In a second terminal, with a manager account already signed in (cookie present):

1. Promote a dev to manager via the UI (`/org/<slug>/members`). Confirm the action succeeds.
2. Open Drizzle Studio: `bun run db:studio`. Open the `audit_log` table. Confirm exactly one new row with `action = "role.change"`, the correct `org_id`, `actor_user_id`, `target_id` = the promoted user's id, and `metadata` JSON containing `{fromRole, toRole}`.
3. Send an invite via the UI. Confirm a new `audit_log` row with `action = "invite.send"`.
4. Mint a new collector token at `/setup/collector`. Confirm a new `audit_log` row with `action = "token.create"`.

Expected: three new `audit_log` rows, one per action class. If any row is missing, do NOT mark this step complete — investigate (most likely the route migration didn't include the `logAudit` call, or the helper is throwing silently — check server logs).

- [ ] **Step 9.5: Verify the existing members page still works**

Navigate to `/org/<slug>/members`. The "role change history" section should still render, populated from `membership_audit` (the dual-write in Task 6 keeps this intact).

Expected: history shows the role change you performed in Step 9.4.

- [ ] **Step 9.6: Final commit (only if any fixups were needed during smoke)**

If nothing needed fixing, skip. Otherwise commit fixes with:

```bash
git add <changed-files>
git commit -m "$(cat <<'EOF'
fix(web): <describe what the smoke test caught>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## What ships at the end of this plan

1. **`audit_log` table** in Postgres with 3 indexes (org+time, actor+time, action+time).
2. **`lib/audit.ts`** — `logAudit()` (best-effort, never throws), `extractRequestMeta()` (pure helper), `AuditAction` union type.
3. **`lib/route-helpers.ts`** — `requireSession()` and `requireManager()` returning either a context object or a `NextResponse` error.
4. **Three privileged routes migrated** to the helpers and emitting audit events:
   - `POST /api/membership/role` → `role.change` (also keeps `membership_audit` write)
   - `GET /api/invite`, `POST /api/invite` → `invite.send` on success
   - `GET /api/tokens`, `POST /api/tokens` → `token.create`
5. **Test coverage**:
   - `audit.test.ts` — 7 unit tests
   - `route-helpers.test.ts` — 6 unit tests
   - `membership/role/route.test.ts` — 2 regression tests
   - `invite/route.test.ts` — 2 regression tests
   - `tokens/route.test.ts` — 2 regression tests
   - **Total new tests: 19**

## What does NOT ship and why

- **A standalone `/org/[slug]/audit` page.** Reading the new table belongs in a separate plan — that plan can also handle the cutover of `members/page.tsx` from `membership_audit` to `audit_log` and the removal of the dual-write from Task 6.
- **Migrations of `/api/github-app/install`, `/api/orgs`, `/api/invite/accept`.** Those routes are user-self-service or installation-time, and folding them into the audit log will need event-name decisions (`org.create`? `org.join`? `github_app.install`?). Done as a follow-up.
- **Token revocation route.** Currently no `DELETE /api/tokens/:id` exists. Adding it is a small, separate plan — and gives us a `token.revoke` audit event at the same time.
- **A central `withManager(handler)` higher-order wrapper.** We chose the `requireSession` / `requireManager` short-circuit pattern instead because it composes cleanly with route handlers that need to read the request body before extracting the org slug, and matches Next.js App Router idioms. A wrapper-style API would force callers into a closure shape that adds nothing.

## Self-review (run before handing off)

1. **Spec coverage** — every item in the plan summary above maps to a task ✅
2. **Placeholders** — none; every step has full code ✅
3. **Type consistency** — `requireManager` returns `{ org: OrgRow, role: "manager" }` in Task 5; consumed in Tasks 6/7 as `mgr.org.id`, `mgr.org.slug`, `mgr.org.githubAppInstallationId`. `OrgRow` includes those fields ✅
4. **Action names consistent** — `role.change`, `invite.send`, `token.create` used identically in `AuditAction` union (Task 3), assertions (Tasks 6/7/8), and route emissions (Tasks 6/7/8) ✅
5. **Mock shapes match real shapes** — `requireSessionMock` returns `{ user: { id } }` matching `SessionContext` from Task 4 ✅
