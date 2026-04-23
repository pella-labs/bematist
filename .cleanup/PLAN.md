# Execution Plan — Agents 2/3/4

Ordered, independent tasks for cleanup. Agent 2 (Pruner) deletes dead code. Agent 3 (Refactorer) refactors duplicates + large files. Agent 4 (Docs) updates .env.example + README + LICENSE.

---

## AGENT 2: PRUNER (Deletions & Dependency Cleanup)

### P-001: Delete Stale Planning Documents

**Files:** `plan.md`, `CURSOR-ADAPTER-PLAN.md`  
**Action:** Delete both files entirely. They document internal feature branches and migrations (completed months ago) and are not OSS documentation.  
**Depends on:** None  
**Severity:** Critical

---

### P-002: Remove Unused Dependencies from apps/web

**Files:** `apps/web/package.json`  
**Action:** Remove three unused dependencies:
- `three` (v0.169.0, no imports found)
- `motion` (v12.38.0, no imports found)
- `dotenv` (v16.4.5, Next.js handles .env automatically)

Run: `bun remove three motion dotenv` from `apps/web/`.  
**Depends on:** None  
**Severity:** Minor (improves bundle size and clarity)

---

## AGENT 3: REFACTORER (Code Restructuring)

### R-001: Consolidate API Auth Middleware

**Files:** 
- Create: `apps/web/lib/api/require-auth.ts`
- Modify: `apps/web/app/api/orgs/route.ts`, `app/api/invite/route.ts`, `app/api/tokens/route.ts`, `app/api/card/token/route.ts`, `app/api/card/star-repo/route.ts`, `app/api/invite/accept/route.ts`, `app/api/card/token-by-star/route.ts` (7+ more)

**Action:**

1. Create new utility file `apps/web/lib/api/require-auth.ts`:

```typescript
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function requireAuth() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { userId: session.user.id };
}
```

2. Replace every instance of:
```typescript
const session = await auth.api.getSession({ headers: await headers() });
if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
```

With:
```typescript
const auth = await requireAuth();
if ("error" in auth) return auth.error;
const userId = auth.userId;
```

**Depends on:** None  
**Severity:** Major (eliminates 12 code copies)

---

### R-002: Create Unified GitHub Fetch Utility

**Files:**
- Create: `apps/web/lib/github-fetch.ts`
- Modify: `apps/web/lib/github-profile.ts`, `apps/web/lib/github-stars.ts`, `apps/web/app/api/card/token/route.ts`

**Action:**

1. Create `apps/web/lib/github-fetch.ts`:

```typescript
export async function fetchGithub(
  path: string,
  token: string,
  options?: RequestInit
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "pellametric",
    },
    ...options,
  });
  if (r.ok) return { ok: true, status: r.status, data: await r.json().catch(() => null) };
  return { ok: false, status: r.status, error: await r.text() };
}
```

2. Replace all three GitHub fetch patterns with calls to this utility.

**Depends on:** None  
**Severity:** Major (consolidates 3 duplicates)

---

### R-003: Decompose CardPage.tsx (2036 lines)

**Files:**
- Create: `apps/web/app/(marketing)/_card/icons.tsx`
- Create: `apps/web/app/(marketing)/_card/slides/SlideOne.tsx` through `SlideSeven.tsx`
- Modify: `apps/web/app/(marketing)/_card/CardPage.tsx` (reduce to ~300 lines orchestration)

**Action:**

1. Extract all SVG icon components (`FlameIcon`, `WrenchIcon`, `RocketIcon`, `MonitorIcon`, etc.) to `icons.tsx`.

2. Create one component per slide (8 slides total, pages 0-7):
   - `SlideOne.tsx` — title slide
   - `SlideTwo.tsx` — top model/tool summary
   - `SlideThree.tsx` — hourly distribution chart
   - `SlideFour.tsx` — file breakdown
   - `SlideFive.tsx` — prompts section
   - `SlideSix.tsx` — achievements/celebrations
   - `SeventhSlide.tsx` — ranking stats
   - `EighthSlide.tsx` — closing call-to-action

3. Refactor `CardPage.tsx` to:
   - Import slide components + icons
   - Handle pagination logic
   - Render `<SlideComponent pageNumber={currentPage} data={data} />` instead of 2000+ lines of inline JSX

4. Extract color/formatting utilities to `card-formatting.ts` if not already present.

**Depends on:** None  
**Severity:** Major (improves maintainability)

---

### R-004: Consolidate Card Token Utilities

**Files:**
- Modify: `apps/web/lib/card-backend.ts`, `apps/web/lib/card-token-mint.ts`
- Optionally refactor: `apps/web/lib/card-backend.ts` to export both backend + minting logic

**Action:**

1. Review both files and consolidate:
   - `hashCardToken()`, `mintCardToken()`, `toCardSlug()`, `isReservedCardSlug()` into one module or closely related pair
   - Or rename `card-backend.ts` to `card-utils.ts` if it's now the authoritative source
   - Update imports across codebase (API routes, CardPage)

2. Ensure clear separation: business logic (`card-backend.ts`) vs UI rendering (`_card/card-utils.ts`)

**Depends on:** None  
**Severity:** Minor (improves clarity)

---

### R-005: Create Collector Logger Abstraction

**Files:**
- Create: `apps/collector/src/logger.ts`
- Modify: All `apps/collector/src/**/*.ts` files that call `console.log/error/warn`

**Action:**

1. Create `logger.ts`:

```typescript
export const logger = {
  log: (msg: string) => console.log(msg),
  error: (msg: string) => console.error(msg),
  warn: (msg: string) => console.warn(msg),
};
```

2. Replace all 53 `console.log/error/warn` calls with `logger.log/error/warn`.

3. Allows future structured logging, testing mocks, and output suppression without code changes.

**Depends on:** None  
**Severity:** Major (improves testability + consistency)

---

### R-006: Standardize API Error Response Shapes

**Files:** All 12 `apps/web/app/api/**/route.ts`

**Action:**

1. Define standard error response type in `apps/web/lib/api/error.ts`:

```typescript
export type ApiError = {
  error: string;
  detail?: string;
};

export function apiError(message: string, detail?: string, status: number = 400) {
  return NextResponse.json({ error: message, detail }, { status });
}
```

2. Replace all ad-hoc `NextResponse.json({ error: "..." }, { status: ... })` with `apiError(...)`.

3. Ensures consistent shape across all endpoints for client-side error handling.

**Depends on:** None  
**Severity:** Minor (improves consistency)

---

## AGENT 4: DOCS (Documentation & Configuration)

### D-001: Update `.env.example` with All 13 Variables

**Files:** `.env.example`

**Action:** Expand to include all referenced env vars with clear annotations:

```
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Authentication (Next.js app)
BETTER_AUTH_SECRET=<openssl rand -hex 32 output>
BETTER_AUTH_URL=http://localhost:3000

# GitHub OAuth
GITHUB_CLIENT_ID=<from GitHub Apps>
GITHUB_CLIENT_SECRET=<from GitHub Apps>

# Optional: GitHub API rate-limit lifting (requires repo:read scope)
GITHUB_TOKEN=ghp_...

# Public URLs (for SSR + client)
NEXT_PUBLIC_SITE_URL=https://pellametric.com
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000

# Encryption for stored prompts (REQUIRED: bun run key-gen or openssl rand -base64 24)
PROMPT_MASTER_KEY=<32-byte base64-encoded key>

# Collector CLI (optional at build time; developer configures via ~/.pella/config.env)
PELLA_COLLECTOR_DEFAULT_URL=https://pellametric.com
PELLA_TOKEN=pm_<your-token>
PELLA_URL=https://pellametric.com

# Feature flags (optional)
PELLA_SKIP_CURSOR=0
```

**Depends on:** None  
**Severity:** Critical (required for OSS onboarding)

---

### D-002: Add Setup Instructions to README

**Files:** `README.md`

**Action:** Ensure README includes:

1. **Development Setup** section:
   - Copy `.env.example` to `.env.local`
   - List required vs optional vars
   - Point to key-generation command for `PROMPT_MASTER_KEY`

2. **Collector Setup** section:
   - Installation from binary releases or `bun build --compile`
   - Configuration via `pella login --token pm_...`
   - How to run as daemon (`pella start`, `pella status`, `pella logs`)

3. **Architecture** section:
   - High-level overview of `apps/web` (Next.js 16 SPA) + `apps/collector` (Bun daemon)
   - Data flow: collector → `/api/ingest` → database
   - Auth: GitHub OAuth + token-based collector

**Depends on:** D-001  
**Severity:** Major (enables new contributors)

---

### D-003: Verify or Add LICENSE

**Files:** `LICENSE` (check if exists; if not, determine appropriate license)

**Action:**

1. Check if `LICENSE` exists in repo root.
2. If missing, add appropriate license (likely MIT or Apache 2.0 based on project scope).
3. If exists, verify it matches project intent and update `package.json` with `"license": "..."`.

**Depends on:** None  
**Severity:** Major (legal requirement for OSS)

---

### D-004: Create CONTRIBUTING.md

**Files:** Create `CONTRIBUTING.md`

**Action:**

1. Document:
   - Code style (TypeScript, ESLint config, formatting)
   - Testing expectations (vitest for unit tests)
   - PR checklist (no secrets, passing tests, env vars in `.env.example`)
   - Dependency management (Bun 1.3.9+, no npm/pnpm)
   - CI/CD expectations (if applicable)

2. Reference existing good practices from codebase (proper auth boundaries, no god-files, etc.)

**Depends on:** None  
**Severity:** Minor (improves contributor experience)

---

## Task Dependency Graph

```
PRUNER (P-*)
├─ P-001: Delete planning docs (no deps) ✓
└─ P-002: Remove unused deps (no deps) ✓

REFACTORER (R-*)
├─ R-001: Auth middleware (no deps, uses lib/api/) ✓
├─ R-002: GitHub fetch utility (no deps) ✓
├─ R-003: Decompose CardPage (no deps) ✓
├─ R-004: Consolidate card utils (no deps) ✓
├─ R-005: Logger abstraction (no deps) ✓
└─ R-006: Standard error shapes (no deps, uses R-001 pattern) ✓

DOCS (D-*)
├─ D-001: Update .env.example (no deps) ✓
├─ D-002: README setup (depends on D-001)
├─ D-003: LICENSE (no deps) ✓
└─ D-004: CONTRIBUTING (no deps) ✓
```

All tasks are largely independent. Agents can work in parallel. Only D-002 depends on D-001 (can happen same session).

---

## Summary

| Agent | Tasks | LOC Impact | Priority |
|-------|-------|-----------|----------|
| **Pruner (P-*)** | 2 | -705 | High |
| **Refactorer (R-*)** | 6 | -300 (net) | High |
| **Docs (D-*)** | 4 | +200 | Critical |
| **TOTAL** | **12** | **-805** | **Ready for OSS** |

All tasks enable the following agent in the pipeline to validate and test changes. Tasks are ordered by criticality (secrets/env first, then dead code, then refactoring, then docs).

