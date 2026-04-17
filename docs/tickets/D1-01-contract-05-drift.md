# D1-01 Primer: Contract 05 naming drift fix (`@devmetrics/*` → `@bematist/*`)

**For:** Fresh session picking up the contract-drift fix
**Project:** bematist (DevMetrics)
**Workstream:** D (owns contract 09); this ticket touches contract 05 owned by H, but D coordinates because the fix pattern matches the one already applied to 03 + 06
**Date:** 2026-04-17
**Previous work:** `D1-00` (env autoload). See `docs/DEVLOG.md`.

---

## What Is This Ticket?

Three contracts (03, 06) received an additive changelog entry on 2026-04-16 flipping import paths from `@devmetrics/schema` → `@bematist/schema` (per PRD D32 — product name is DevMetrics, repo/workspace namespace is `@bematist`). Contract **05 — Embed provider** was missed and still references the old namespace. This ticket lands the matching additive changelog line so H's embed work can build against the correct import path without drift.

### Why It Matters

- Workstream H starts embed provider work in Sprint 2; landing this now means they don't discover the drift mid-sprint.
- It's the cheapest visible win — 2 files, one grep-replace, clear pattern already established in 03 + 06.
- Additive changelog-only change per `contracts/README.md` policy → one consumer reviewer approves + merges.

---

## What Was Already Done

- PRD D32 locked `@bematist/*` as workspace namespace (commit `b086bfc`).
- Contract 03 (`03-adapter-sdk.md`) updated with import-path changelog on 2026-04-16.
- Contract 06 (`06-clio-pipeline.md`) updated with import-path changelog on 2026-04-16.
- Contract 05 NOT yet updated — still references `@devmetrics/*` in code snippets.

---

## What This Ticket Must Accomplish

### Goal

`contracts/05-embed-provider.md` references `@bematist/*` (not `@devmetrics/*`) with an additive changelog line matching the pattern in 03/06.

### Deliverables Checklist

#### A. Implementation

- [ ] Grep `contracts/05-embed-provider.md` for `@devmetrics`; flip each occurrence to `@bematist` (expect 0–2 hits based on current contract review)
- [ ] Append changelog entry to `contracts/05-embed-provider.md` matching the pattern from 03 + 06:
  ```markdown
  - 2026-04-17 — Sprint-0 M0: `@devmetrics/*` import paths → `@bematist/*` (repo renamed; see PRD §D32). Product name stays DevMetrics.
  ```
- [ ] Update `Last touched:` field in frontmatter to `2026-04-17`

#### B. Tests

- [ ] Grep entire `contracts/` tree for remaining `@devmetrics` references — expect zero after this ticket
- [ ] `bun run typecheck` — unaffected (contracts are docs, not code), confirm clean anyway

#### C. Integration Expectations

- [ ] No code-path changes; this is documentation drift only
- [ ] Consumers (G — Clio embed stage, C — ingest server-side embed, H — nightly cluster + Twin Finder) are unaffected at runtime — they already import from `@bematist/*`

#### D. Documentation

- [ ] Contract 05 changelog updated (the deliverable itself)
- [ ] Append entry to `docs/DEVLOG.md`
- [ ] Update `docs/tickets/README.md` status to ✅

---

## Branch & Merge Workflow

```bash
git switch main && git pull
git switch -c D1-01-contract-05-drift-jorge

# single-file edit; use Edit tool, not sed

bun run lint && bun run typecheck && bun run test
git add contracts/05-embed-provider.md
git commit -m "docs(contracts): 05 — @devmetrics/* → @bematist/* import paths"
git push -u origin D1-01-contract-05-drift-jorge
gh pr create --base main \
  --title "docs(contracts): 05 embed-provider — @bematist/* import paths" \
  --body "$(cat <<'EOF'
## Summary
- Aligns contract 05 with PRD D32 naming convention.
- Matches the additive-changelog pattern landed in 03 and 06 on 2026-04-16.
- Documentation-only; no consumer code change required.

## Test plan
- [x] Grep shows zero `@devmetrics/*` references in contracts/ after this change
- [x] typecheck / lint / test unchanged

Refs #3
EOF
)"
```

---

## Important Context

### Files to Modify

| File | Action |
|------|--------|
| `contracts/05-embed-provider.md` | Flip `@devmetrics/*` → `@bematist/*`; add 2026-04-17 changelog line |
| `docs/DEVLOG.md` | Append entry |
| `docs/tickets/README.md` | Flip D1-01 row to ✅ |

### Files You Should NOT Modify

- `contracts/03-adapter-sdk.md` or `contracts/06-clio-pipeline.md` (already fixed 2026-04-16)
- Any source code under `packages/embed/` — consumer changes are a separate ticket if needed

### Files You Should READ for Context

| File | Why |
|------|-----|
| `dev-docs/PRD.md` §D32 | Locks the `@bematist/*` convention |
| `contracts/README.md` "How to change a contract" | Additive vs breaking rules |
| `contracts/03-adapter-sdk.md` Changelog | Pattern to match |
| `contracts/06-clio-pipeline.md` Changelog | Pattern to match |

---

## Architectural Decisions

| Decision | Reference | Summary |
|----------|-----------|---------|
| Namespace | D32 | Product = DevMetrics; repo slug = bematist; workspace packages = `@bematist/*`. |
| Change class | contracts/README | Additive (default to old alongside new if possible). Here: renaming a purely documentation reference, so single-shot flip is fine. |

---

## Definition of Done

- [ ] Contract 05 references `@bematist/*` with 2026-04-17 changelog entry
- [ ] Zero `@devmetrics/*` remaining in `contracts/`
- [ ] `bun run test` / `typecheck` / `lint` green
- [ ] DEVLOG entry
- [ ] Tickets README flipped to ✅
- [ ] Branch pushed, PR opened `Refs #3`

---

## Estimated Time

| Task | Estimate |
|------|----------|
| Edit contract | 10 min |
| Grep verify | 5 min |
| Commit + PR | 10 min |
| DEVLOG | 5 min |

~30 min total.

---

## After This Ticket: What Comes Next

- **D1-02** (materialized views) — the real Sprint 1 substantive work begins.
- Unblocks H's embed-provider consumer code (Sprint 2) from any namespace confusion.
