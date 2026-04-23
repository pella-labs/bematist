# Cursor adapter — dashboard + parity plan

Self-contained execution plan. After `/compact` read this file first.

---

## Where we are

- Repo: `~/Desktop/pella-labs/pellametric`
- Branch: `feat/cursor-adapter` (off `main`). PR **#118** open.
- 4 commits on the branch:
  - `c1fb085` feat(collector): cursor adapter — SQLite source with model detection + incremental sweep
  - `7097c8d` feat(collector): dual sqlite backend — prefer bun:sqlite, fall back to CLI
  - `c391554` fix(collector): cross-platform Windows path handling in cursor adapter
  - `85b8940` **wip(deck): problem→value slide iteration** — **unrelated marketing commit; NOT part of this PR**
- Unstaged: `apps/web/next-env.d.ts` — auto-generated, ignore.
- Drizzle: no file-based migrations; `bun run db:push` syncs schema directly.

**First step in execution:** cherry-pick or revert `85b8940` out of the branch so only the 3 cursor commits remain — OR confirm with user it belongs here. Most likely: `git reset --soft 85b8940^` + re-commit unrelated deck work to its own branch. Don't assume; check with user.

---

## Decisions locked

| # | Decision |
|---|---|
| 1 | Cost authority: use `usageData.<model>.costInCents` when present. Add `costCents: bigint` column to `session_event`. Dashboard uses `costCents` when > 0, else falls back to `costFor(model, …)`. |
| 2 | Planning signal: when `composerData.todos.length >= 3`, inject `"cursor:planning"` into `skillsUsed`. Makes the existing "planned" outcome bucket light up for Cursor without schema changes. |
| 3 | Checkpoint file union: for each composer, read `checkpointId:<cid>:*` rows and union their `files[].uri` into `filesEdited`. 7–10× richer coverage than `originalFileStates` alone. |
| 4 | **SKIP** Cmd+K stream for v1 (aiService.generations). Document as v1.1 follow-up. |
| 5 | **SKIP** Tab completion counter for v1. Document as v1.1 follow-up. |
| 6 | PRICING: add all Cursor-emitted model names with real per-model rates (NOT just fall back to default). |
| 7 | Colors — rebrand: **Claude = orange** (was sage), **Codex = blue** (new), **Cursor = white with opacity** (Cursor brand). |
| 8 | Hide cache-read, cache-write, cache-hit KPIs for Cursor (always 0). Mirror existing `{source === "codex" && …}` pattern. |

---

## Changes — file by file

### Schema (widen + new column)

**`apps/web/lib/db/schema.ts`**
- Add to `sessionEvent`:
  ```ts
  costCents: bigint("cost_cents", { mode: "number" }).notNull().default(0),
  ```
- Update comments on `source` fields: `// "claude" | "codex" | "cursor"`
- No new indices needed.

**Deploy:** `bun run db:push` (ADDITIVE column, safe). Existing rows get `0`.

### Shared types

**`packages/shared/src/index.ts`**
- `IngestSession`: add `costCents?: number;` (optional so claude/codex don't have to send it).
- Already widened: `IngestPayload.source: "claude" | "codex" | "cursor"`.

### Ingest route

**`apps/web/app/api/ingest/route.ts`**
- `sessionSchema`: add `costCents: z.number().int().nonnegative().default(0)`.
- `row` builder: add `costCents: s.costCents ?? 0`.
- Upsert `set` clause: add `costCents: row.costCents`.

### Pricing

**`apps/web/lib/pricing.ts`** — add entries (real published rates, USD per 1M tokens):

```ts
// Cursor-emitted model names (values straight from their aiSettings)
"claude-4-sonnet":           { in: 3,    out: 15, cr: 0.30, cw: 3.75 },
"claude-4-sonnet-thinking":  { in: 3,    out: 15, cr: 0.30, cw: 3.75 },
"claude-3.5-sonnet":         { in: 3,    out: 15, cr: 0.30, cw: 3.75 },
"claude-3-5-sonnet-200k":    { in: 3,    out: 15, cr: 0.30, cw: 3.75 },
"gpt-4o":                    { in: 2.50, out: 10, cr: 1.25, cw: 0 },
"gpt-4.1":                   { in: 2,    out: 8,  cr: 0.50, cw: 0 },
"o3":                        { in: 2,    out: 8,  cr: 0.50, cw: 0 },  // placeholder — verify before release
```

Keep `claude-opus-*`, `claude-haiku-*`, `codex` entries as-is.

Note: for Cursor sessions with `costCents > 0`, we use the authoritative cost and PRICING is only a display fallback.

### Collector types

**`apps/collector/src/types.ts`**
- `SessionState`: add `costCents: number`.
- `newSessionState()`: initialize `costCents: 0`.

### Collector accumulator

**`apps/collector/src/accumulator.ts`**
- `toWire()`: include `costCents: s.costCents`.

### Cursor adapter — add 3 enhancements

**`apps/collector/src/parsers/cursor.ts`**

1. **`usageData` extraction** (new function):
   ```ts
   function extractUsage(cd: CursorComposer): { model?: string; costCents: number } {
     const ud = (cd as any).usageData;
     if (!ud || typeof ud !== "object") return { costCents: 0 };
     const keys = Object.keys(ud);
     if (keys.length === 0) return { costCents: 0 };
     // Prefer a non-"default" key (model-named); fall back to "default".
     const key = keys.find(k => k !== "default") ?? keys[0];
     const entry = ud[key];
     const cents = typeof entry?.costInCents === "number" ? entry.costInCents : 0;
     return { model: key === "default" ? undefined : key, costCents: cents };
   }
   ```
2. **Checkpoint file union** (new function):
   ```ts
   function readCheckpointFiles(gdb: string, cid: string): string[] {
     const rows = sqliteQuery<{ value: string }>(
       gdb,
       `SELECT value FROM cursorDiskKV WHERE key LIKE 'checkpointId:${cid}:%'`,
     );
     const out = new Set<string>();
     for (const { value } of rows) {
       if (!value) continue;
       try {
         const ck = JSON.parse(value);
         for (const f of (ck.files || [])) {
           const p = fileUriToPath(f.uri || "");
           if (p) out.add(p);
         }
       } catch { /* skip */ }
     }
     return [...out];
   }
   ```
3. **Planning-todo signal** — in `buildCursorSessionState`, after computing skillsUsed (currently empty):
   ```ts
   const todos = (cd as any).todos || [];
   if (todos.length >= 3) s.skillsUsed.add("cursor:planning");
   ```

4. **Model override** — `pickModel` gets third source:
   ```ts
   export function pickModel(cd: CursorComposer, ai: CursorAiSettings, usage?: { model?: string }): string | undefined {
     if (usage?.model) return usage.model;  // historical model from usageData
     const mode = cd.unifiedMode || cd.forceMode;
     if (mode === "chat") return ai.regularChatModel || ai.composerModel;
     return ai.composerModel || ai.regularChatModel;
   }
   ```

5. **Wire into `sweepCursor`** (replaces the existing model+state-build stanza):
   ```ts
   const usage = extractUsage(cd);
   const model = pickModel(cd, aiSettings, usage);
   const checkpointFiles = readCheckpointFiles(gdb, cid);
   const s = buildCursorSessionState(cd, bubblesOrdered, bubblesAll, cwd, model);
   for (const f of checkpointFiles) s.filesEdited.add(f);
   s.costCents = usage.costCents;
   sessions.set(cid, s);
   ```

### Aggregate function

**`apps/web/lib/aggregate.ts`**
- `Row` type: add `costCents?: number`.
- `aggregate(rows, source: "claude" | "codex" | "cursor")`.
- Totals: add `costCents: a.costCents + Number(r.costCents ?? 0)`.
- Meta: add `costUsd: +(totals.costCents / 100).toFixed(2)` (when costCents > 0, use it; otherwise dashboard falls back to `costFor()` in the existing team-table code).
- `aggregateBoth` → rename or extend:
  ```ts
  export function aggregateAll(rows: Row[]) {
    return {
      claude: aggregate(rows, "claude"),
      codex:  aggregate(rows, "codex"),
      cursor: aggregate(rows, "cursor"),
    };
  }
  // keep aggregateBoth as an alias that returns the same 3-key shape for
  // backwards compat in case anywhere else imports it.
  export const aggregateBoth = aggregateAll;
  ```

### Dashboard components

#### `apps/web/components/org-dashboard.tsx`
- Import color palette — **rebrand all three source colors**:
  ```ts
  const CLAUDE_COLOR = "#d88d4f";         // warm orange — was SAGE
  const CODEX_COLOR  = "#5a8fc2";         // muted blue
  const CURSOR_COLOR = "rgba(237,232,222,0.85)"; // white-with-opacity (Cursor brand)
  ```
  Update `lineData`/`barData`/`donutData` callers to use `sourceColor(source)` helper.
- Widen `useState<"claude" | "codex" | "cursor">`.
- `data` prop: `{ claude: Data; codex: Data; cursor: Data }`.
- Add third `TabBtn`:
  ```tsx
  <TabBtn active={source === "claude"} label="Claude Code" count={data.claude.meta.sessions} onClick={() => setSource("claude")} />
  <TabBtn active={source === "codex"}  label="Codex"       count={data.codex.meta.sessions}  onClick={() => setSource("codex")} />
  <TabBtn active={source === "cursor"} label="Cursor"      count={data.cursor.meta.sessions} onClick={() => setSource("cursor")} />
  ```
- Hide cache KPIs for cursor: wrap the three cache tiles in `{source !== "cursor" && (…)}`.
- Change existing `{source === "codex" && <Kpi k="reasoning" …>}` to keep (Cursor still 0 here, already hidden).
- `Kpi k="source"` — replace the raw string with a colored badge (use the palette constants).

#### `apps/web/components/my-digest.tsx`
- Same widening: `useState`, `data` prop, third `SrcTab`.
- `buildDigest` already source-agnostic — works as-is.
- Empty state message updated: `No {source} sessions yet for you in this org.` (works already).

#### `apps/web/components/my-project-sessions.tsx`
- Widen `Sess["source"]`, `useState`, tab bar.
- Add `cursorCount = sessions.filter(s => s.source === "cursor").length`.
- Add `SourceTab active={source === "cursor"} …`.

#### `apps/web/components/sessions-list.tsx`
- Widen `Session["source"]`.
- Source column already shows a value; consider color-coded badges per source (orange/blue/white).

#### `apps/web/components/org-view-switcher.tsx`
- Widen `source: "claude" | "codex" | "cursor"`.

#### `apps/web/app/org/[slug]/page.tsx`
- Line 193: change `as "claude" | "codex"` → `as "claude" | "codex" | "cursor"`.
- The `aggregateBoth((...) as any)` call continues to work since we renamed it as an alias.

#### `apps/web/app/org/[slug]/dev/[login]/page.tsx`
- Line 133: same widening.
- `costFor` fallback: when row has `costCents > 0`, use that instead of `costFor()` result. Tiny change — gate with a function:
  ```ts
  function rowCost(row) {
    if (row.costCents && row.costCents > 0) return row.costCents / 100;
    return costFor(row.model, { … });
  }
  ```

### Color palette — where it lives

The palette constants (CLAUDE_COLOR, CODEX_COLOR, CURSOR_COLOR) should live in a shared place so all three dashboard components use the same values. Create **`apps/web/lib/source-colors.ts`**:

```ts
export const SOURCE_COLORS = {
  claude: "#d88d4f",
  codex:  "#5a8fc2",
  cursor: "rgba(237,232,222,0.85)",
} as const;

export type Source = keyof typeof SOURCE_COLORS;

export function sourceColor(s: Source): string {
  return SOURCE_COLORS[s];
}
```

Import in all three dashboard components that need color.

---

## Tests to add

**`apps/collector/src/__tests__/cursor.test.ts`**

```ts
describe("usageData extraction", () => {
  it("picks model-named key as historical model", () => {
    const cd = { usageData: { "claude-4-sonnet-thinking": { amount: 8, costInCents: 32 } } };
    expect(extractUsage(cd)).toEqual({ model: "claude-4-sonnet-thinking", costCents: 32 });
  });
  it("falls back to 'default' and no model", () => {
    const cd = { usageData: { default: { amount: 2, costInCents: 5 } } };
    expect(extractUsage(cd)).toEqual({ model: undefined, costCents: 5 });
  });
  it("returns zero when usageData absent or empty", () => {
    expect(extractUsage({})).toEqual({ costCents: 0 });
    expect(extractUsage({ usageData: {} })).toEqual({ costCents: 0 });
  });
});

describe("pickModel with usageData override", () => {
  it("prefers usageData model over aiSettings", () => {
    expect(pickModel({ unifiedMode: "agent" }, { composerModel: "claude-4-sonnet" }, { model: "o3" }))
      .toBe("o3");
  });
  it("falls back to aiSettings when usageData has no model", () => {
    expect(pickModel({ unifiedMode: "agent" }, { composerModel: "claude-4-sonnet" }, {}))
      .toBe("claude-4-sonnet");
  });
});

describe("buildCursorSessionState planning-todo injection", () => {
  it("injects 'cursor:planning' skill when todos.length >= 3", () => {
    const cd = { composerId: "x", createdAt: 0, lastUpdatedAt: 1,
                 todos: [{status:"pending",content:"a"},{status:"pending",content:"b"},{status:"pending",content:"c"}] };
    const s = buildCursorSessionState(cd as any, [], [], "/r", undefined);
    expect([...s.skillsUsed]).toContain("cursor:planning");
  });
  it("does not inject for < 3 todos", () => {
    const cd = { composerId: "x", createdAt: 0, lastUpdatedAt: 1,
                 todos: [{status:"pending",content:"only one"}] };
    const s = buildCursorSessionState(cd as any, [], [], "/r", undefined);
    expect([...s.skillsUsed]).not.toContain("cursor:planning");
  });
});
```

**`apps/web/lib/__tests__/aggregate.test.ts`**

- Add test: `aggregateAll returns claude + codex + cursor keys`.
- Add test: `cursor costCents rolls up into meta.costUsd`.

---

## Build + verification commands

```bash
# Typecheck
cd apps/collector && bun x tsc --noEmit
cd apps/web       && bun x tsc --noEmit

# Tests
cd apps/collector && bun x vitest run
cd apps/web       && bun x vitest run

# Rebuild collector.mjs bundle (only after adapter changes)
cd apps/collector && bun run build

# Push schema (additive column, safe on existing DB)
cd .. && bun run db:push
```

---

## Commit strategy

All additions onto existing branch `feat/cursor-adapter`. One commit per logical chunk:

1. **`feat(schema): cost_cents column + cursor source widening`**
   - `apps/web/lib/db/schema.ts` + `apps/web/app/api/ingest/route.ts` + `packages/shared/src/index.ts`
2. **`feat(collector): cursor usageData + checkpoint files + planning signal`**
   - `apps/collector/src/parsers/cursor.ts` + `types.ts` + `accumulator.ts` + tests
   - Rebuild `apps/web/public/collector.mjs`
3. **`feat(web): cursor dashboard + source colors + pricing`**
   - `apps/web/lib/aggregate.ts` + `source-colors.ts` + 6 component files + 2 page files + `pricing.ts` + aggregate tests

---

## PR update (after all commits land)

Expand PR #118 body to note:
- New column `cost_cents` on `session_event` (additive)
- Dashboard rebrand: Claude → orange, Codex → blue, Cursor → white-with-opacity
- `usageData` authoritative for Cursor cost + historical model
- Checkpoint file union
- Todos → planning skill
- PRICING parity across all Cursor-emitted models
- v1.1 follow-ups: Cmd+K stream, Tab-completion counter

---

## Explicit non-goals (v1 scope boundary)

1. Cmd+K aiService.generations — deferred
2. Tab completion counter — deferred
3. `codeBlockDiff` extraction — deferred
4. `messageRequestContext` — deferred (mostly empty anyway)
5. Cursor Insider / Nightly variant dirs — deferred (not seen on this user's machine)
6. Windows manual test — deferred to "before release" checklist

---

## Pre-commit checklist

- [ ] `85b8940` wip(deck) commit removed or rebased off the branch (confirm with user)
- [ ] `bun run db:push` run after schema change
- [ ] All typecheck + test commands green
- [ ] `collector.mjs` rebuilt and committed
- [ ] PR body updated
- [ ] Windows / Linux manual test TODO on the PR's test plan section
