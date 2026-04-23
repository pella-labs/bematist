# Pellametric Codebase Audit — Agent 1 (Auditor)

Comprehensive findings organized by the 6 principles for open-source readiness.

---

## 1. Secrets & Surprises

### Critical: Incomplete `.env.example` — Missing 8 Referenced Variables

**Severity:** CRITICAL  
**Location:** `.env.example` (missing entries) vs code references  
**Finding:** The `.env.example` file lists only 5 variables but the codebase references 13. Developers cannot know what environment variables are required without reading source code.

**Missing entries:**
- `NEXT_PUBLIC_SITE_URL` — `apps/web/app/layout.tsx:1` (defaults to "https://pellametric.com")
- `NEXT_PUBLIC_BETTER_AUTH_URL` — `apps/web/lib/auth-client.ts:2` (required for client-side auth)
- `PROMPT_MASTER_KEY` — `apps/web/lib/crypto/prompts.ts:10` (REQUIRED: 32-byte base64, throws if missing)
- `GITHUB_TOKEN` — `apps/web/lib/github-profile.ts:13`, `github-stars.ts:8` (optional, lifts GitHub API quota)
- `PELLA_TOKEN` — `apps/collector/src/index.ts:24` (collector: API token for ingestion)
- `PELLA_URL` — `apps/collector/src/index.ts:25` (collector: backend URL, optional)
- `PELLA_COLLECTOR_DEFAULT_URL` — `apps/collector/build.ts:11` (build-time default, optional)
- `PELLA_SKIP_CURSOR` — `apps/collector/src/serve.ts:130` (feature flag, optional)

**Proposed fix:** Update `.env.example` to list all 13 variables with brief descriptions and whether they are required vs optional.

---

### Minor: `.DS_Store` Exists on Disk (Not Tracked)

**Severity:** MINOR  
**Location:** `.DS_Store` (working directory)  
**Finding:** `.DS_Store` is properly gitignored and not tracked, but still exists on macOS. Not a problem for OSS, but clean-up improves hygiene.

**Proposed fix:** Remove the file locally before release (`rm .DS_Store`); no .gitignore change needed.

---

## 2. DRY Principle

### Major: Duplicated Error Handler Pattern

**Severity:** MAJOR  
**Location:** API routes (`apps/web/app/api/**/route.ts`)  
**Finding:** 12 API routes repeat the same session-fetch-and-validate pattern:
- `const session = await auth.api.getSession({ headers: await headers() })`
- `if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })`

This appears in `orgs/route.ts`, `invite/route.ts`, `tokens/route.ts`, `card/token/route.ts`, `card/star-repo/route.ts`, `invite/accept/route.ts` and others.

**Proposed fix:** Extract to a shared middleware or utility: `async function requireAuth() => Promise<{ userId: string } | { error: NextResponse }>`. Use in all routes.

---

### Major: Duplicated GitHub API Fetch Patterns

**Severity:** MAJOR  
**Location:** `apps/web/lib/github-profile.ts:13-16`, `github-stars.ts:8-10`, `apps/web/app/api/card/token/route.ts:29-34`  
**Finding:** Three separate places construct GitHub API fetch headers with `Bearer ${token}` and handle errors differently. Token authorization should be centralized.

**Proposed fix:** Create `fetchGithub(path, token, options?)` utility wrapping common headers + error handling.

---

### Minor: Multiple Card/Token Utilities

**Severity:** MINOR  
**Location:** `apps/web/lib/card-backend.ts`, `card-token-mint.ts`, `card-backend.ts`  
**Finding:** Three utility files handle card tokens and slugs. Logic is split across `hashCardToken`, `mintCardToken`, `toCardSlug`, `isReservedCardSlug`.

**Proposed fix:** Consolidate into single `card-utils.ts` (different from `_card/card-utils.ts` which is UI-only) or rename for clarity.

---

## 3. Dead Code Inventory

### Critical: Two Stale Planning Documents

**Severity:** CRITICAL  
**Location:** `plan.md` (329 lines), `CURSOR-ADAPTER-PLAN.md` (376 lines)  
**Finding:** Both files are detailed implementation/migration notes from internal development and feature branches. They reference internal commit hashes, make execution decisions for past work, and should not be in the public repo.

- `plan.md`: pnpm → bun migration plan (completed, Oct 2024)
- `CURSOR-ADAPTER-PLAN.md`: cursor adapter feature branch notes (merged, refers to PR #118)

**Proposed fix:** Move to `.archive/` or delete entirely. Not OSS documentation.

---

### Major: CardPage.tsx Inline SVGs (2036 lines)

**Severity:** MAJOR  
**Location:** `apps/web/app/(marketing)/_card/CardPage.tsx`  
**Finding:** Monolithic 2036-line component contains 300+ lines of inline SVG icon definitions (`FlameIcon`, `WrenchIcon`, `RocketIcon`, etc.) mixed with business logic for rendering card slides (8 slides, pagination, animations). Not dead code, but should be decomposed.

**Proposed fix:** Extract SVG icons to `icons.tsx`, create per-slide components (`SlideOne.tsx`, `SlideTwo.tsx`, etc.), reduce main to orchestration layer.

---

### Minor: Unused Dependencies

**Severity:** MINOR  
**Location:** `apps/web/package.json`  
**Finding:** Three dependencies are imported but never used:
- `three` v0.169.0 (no references in codebase)
- `motion` v12.38.0 (no references in codebase)
- `dotenv` v16.4.5 (not used; Next.js handles .env automatically)

**Proposed fix:** Remove from `package.json`: `bun remove three motion dotenv`.

---

## 4. Naming & Comments

### Major: God-Files in UI Layer

**Severity:** MAJOR  
**Location:** `apps/web/components/org-dashboard.tsx` (440 lines)  
**Finding:** Large component mixes chart initialization, data aggregation, and rendering. 

**Proposed fix:** Extract chart logic to `ChartPanel.tsx`, filter/sort logic to hooks.

---

### Minor: Abbreviation Soup in Collector

**Severity:** MINOR  
**Location:** `apps/collector/src/` (throughout)  
**Finding:** Variable names like `ts`, `sid`, `cwd`, `tk`, `m`, `r`, `accToken` are valid in tight scopes but reduce clarity for new readers.

**Proposed fix:** Expand abbreviations in public-facing code: `timestamp`, `sessionId`, `currentWorkingDir`, `token`, `message`, `response`, `accessToken`.

---

### Minor: Over-Generic Naming

**Severity:** MINOR  
**Location:** `apps/web/lib/aggregate.ts` (328 lines)  
**Finding:** File aggregates session stats and serves as a catch-all for formatting/calculation utilities. Name is accurate but could be more specific: `session-aggregation.ts` or `stats-formatter.ts`.

**Proposed fix:** Rename to `session-stats.ts` or `aggregate-sessions.ts` for clarity.

---

## 5. Small Surface Area & Clear Boundaries

### Major: Boundary Violations in API Routes

**Severity:** MAJOR  
**Location:** `apps/web/app/api/` (all 12 route.ts files)  
**Finding:** Every route handles its own:
- Session validation
- GitHub token lookup  
- Database queries
- Error responses

No shared error boundary or middleware. Client/server boundary is clear (no issues), but route coupling is high.

**Proposed fix:** Implement middleware layer for auth + error handling. Group routes by resource (`/api/v1/tokens/`, `/api/v1/sessions/`, etc.).

---

### Minor: Inconsistent Error Response Shapes

**Severity:** MINOR  
**Location:** API routes  
**Finding:** Error responses vary:
- `{ error: "msg" }` — most routes
- `{ error: "validation", issues: […] }` — `ingest/route.ts:77`
- `{ error, detail: "..." }` — `orgs/route.ts:27`

**Proposed fix:** Standardize to `{ error: string, detail?: string, status: number }` across all routes.

---

### Minor: No "Use Client" Violations Detected

**Severity:** NONE  
**Finding:** All 11 client components properly import from `auth-client` (not `auth`), and server-only modules are not imported in components. Clean boundary.

---

## 6. Consistency is the Feature

### Major: Inconsistent Data-Fetching Patterns in Web App

**Severity:** MAJOR  
**Location:** `apps/web/app/` (RSC pages vs client components)  
**Finding:** 
- Server-rendered pages (`org/[slug]/page.tsx`, `page.tsx`) fetch data directly in component
- Client components (`org-dashboard.tsx`, `sessions-list.tsx`) use `useEffect` + fetch in browser
- No abstraction for retry, caching, or error boundaries

**Proposed fix:** Create shared fetch utility with retry logic and implement Server Components consistently for data queries (reduce client fetches).

---

### Major: Collector CLI Uses Bare console.log for UI Output

**Severity:** MAJOR  
**Location:** `apps/collector/src/` (53 console.* calls)  
**Finding:** Commands output via bare `console.log/error` with no structured logging. Hard to test, no way to suppress output.

Examples: `apps/collector/src/commands/runOnce.ts:27-78` prints 50+ lines of progress with no centralized logger.

**Proposed fix:** Create `logger.ts` with `{ log, error, warn }` functions; inject into services. Allows testing and future structured output.

---

### Minor: Inconsistent Sorting/Filtering in Tables

**Severity:** MINOR  
**Location:** `apps/web/components/team-tables.tsx`, `sessions-list.tsx`  
**Finding:** Each table implements its own sort/filter logic. No shared column definitions or sorting utilities.

**Proposed fix:** Create `table-utils.ts` with shared sort/filter strategies and column metadata.

---

## Summary by Principle

| Principle | Critical | Major | Minor |
|-----------|----------|-------|-------|
| 1. Secrets | 1 | 0 | 1 |
| 2. DRY | 0 | 3 | 1 |
| 3. Dead Code | 1 | 1 | 1 |
| 4. Names | 0 | 1 | 2 |
| 5. Boundaries | 0 | 1 | 1 |
| 6. Consistency | 0 | 2 | 1 |
| **TOTAL** | **2** | **8** | **7** |

---

## High-Risk Items (Must Fix Before OSS Release)

1. **Update `.env.example`** with all 13 variables (critical for onboarding)
2. **Delete planning documents** (`plan.md`, `CURSOR-ADAPTER-PLAN.md`)
3. **Refactor auth middleware** (eliminate 12 code copies)
4. **Consolidate GitHub fetch patterns** (3 locations)
5. **Decompose CardPage.tsx** (2036 lines is unmaintainable)

---

## Total Findings: 17

- **Critical:** 2
- **Major:** 8  
- **Minor:** 7

All findings are actionable and prioritized for Agents 2/3/4 in PLAN.md.

