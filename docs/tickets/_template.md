# TICKET-ID Primer: [Title]

**For:** Fresh Claude Code / Cursor session resuming Jorge's work
**Project:** bema (DevMetrics) — open-source AI-engineering analytics
**Workstream:** D (Storage & Schema) or H-AI (AI pipeline)
**Date:** [YYYY-MM-DD]
**Previous work:** [Prerequisites]. See `docs/DEVLOG.md`.

---

## What Is This Ticket?

[1–2 paragraphs: what this ticket implements and why it matters in the pipeline.]

### Why It Matters

- [Bullet 1]
- [Bullet 2]
- [Bullet 3]

---

## What Was Already Done

- [List of completed prerequisite tickets and what they provide]
- [Existing files, contracts, or configs this ticket depends on]

---

## What This Ticket Must Accomplish

### Goal

[Single sentence: the concrete outcome.]

### Deliverables Checklist

#### A. Implementation

- [ ] [Specific deliverable 1 — file path]
- [ ] [Specific deliverable 2 — file path]
- [ ] […]

#### B. Tests

- [ ] Test-first where practical (per `superpowers:test-driven-development`)
- [ ] [Specific test 1]
- [ ] [Specific test 2]
- [ ] […]

#### C. Integration Expectations

- [ ] [What this module must be compatible with — contract section, consumer workstream]
- [ ] [Invariants from `contracts/NN-*.md` preserved]

#### D. Documentation

- [ ] Append entry to `docs/DEVLOG.md`
- [ ] Update `docs/tickets/README.md` status column
- [ ] Update any affected contract's Changelog (additive or breaking — see `contracts/README.md`)

---

## Branch & Merge Workflow

```bash
git switch main && git pull
git switch -c D<sprint>-<phase>-<short-slug>-jorge
# ... implement ...
bun run lint && bun run typecheck && bun run test
git push -u origin D<sprint>-<phase>-<short-slug>-jorge
gh pr create --base main --title "<type>: <summary>" --body-file <(echo "Refs #3")
```

- Conventional Commits: `test:`, `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
- Link every intermediate PR with `Refs #3`; the final Sprint 1 PR uses `Closes #3`.

---

## Important Context

### Files to Create

| File | Why |
|------|-----|
| `path/to/new_file.ts` | [Purpose] |

### Files to Modify

| File | Action |
|------|--------|
| `path/to/file.ts` | [What to change] |
| `docs/DEVLOG.md` | Append ticket entry |
| `docs/tickets/README.md` | Flip status to ✅ |

### Files You Should NOT Modify

- [List of files outside scope — usually other workstreams' code]

### Files You Should READ for Context

| File | Why |
|------|-----|
| `dev-docs/PRD.md` §X.Y | Decision reference |
| `CLAUDE.md` §<rule section> | Project rules |
| `contracts/NN-*.md` | Cross-workstream contract |
| `docs/DEVLOG.md` | Prior ticket status |

---

## Architectural Decisions

| Decision | Reference | Summary |
|----------|-----------|---------|
| [Topic] | D# / §X.Y | [One-line summary of the chosen approach from the PRD] |

---

## Suggested Implementation Pattern

[Code examples, function signatures, SQL snippets, data flow diagrams. Reference `contracts/NN-*.md` liberally — don't duplicate schemas.]

---

## Edge Cases to Handle

1. [Edge case 1]
2. [Edge case 2]

---

## Definition of Done

- [ ] All deliverables checked off above
- [ ] `bun run test` green
- [ ] `bun run typecheck` green
- [ ] `bun run lint` green
- [ ] Contract Changelog entry appended (if schema/API changed)
- [ ] `docs/DEVLOG.md` entry appended
- [ ] `docs/tickets/README.md` status flipped to ✅
- [ ] Branch pushed and PR opened against `main`

---

## Estimated Time

| Task | Estimate |
|------|----------|
| [Phase 1] | X min |
| [Phase 2] | X min |
| DEVLOG + contract changelog | 10 min |

---

## After This Ticket: What Comes Next

- [What tickets this unblocks]
- [Dependencies it satisfies for other workstreams]
