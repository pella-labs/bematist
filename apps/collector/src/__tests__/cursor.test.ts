import { describe, expect, it } from "vitest";
import {
  buildCursorSessionState,
  type CursorAiSettings,
  type CursorBubble,
  type CursorComposer,
  interpolateTurnTs,
  isSafeCursorId,
  pickModel,
} from "../parsers/cursor";

describe("isSafeCursorId", () => {
  it("accepts valid UUIDs", () => {
    expect(isSafeCursorId("756acbd7-47fa-4fcc-92bb-1175276c3cbf")).toBe(true);
    expect(isSafeCursorId("AA03EC5F-AE4E-4429-8DB6-832D44C50599")).toBe(true);
  });
  it("rejects anything that could enable SQL LIKE injection", () => {
    expect(isSafeCursorId("foo")).toBe(false);
    expect(isSafeCursorId("' OR 1=1; --")).toBe(false);
    expect(isSafeCursorId("756acbd7-47fa-4fcc-92bb-1175276c3cbf:evil")).toBe(false);
    expect(isSafeCursorId("")).toBe(false);
  });
});

describe("pickModel", () => {
  const ai: CursorAiSettings = {
    composerModel: "claude-4-sonnet",
    regularChatModel: "claude-4-sonnet-thinking",
    cmdKModel: "gpt-4o",
  };
  it("uses composerModel in agent/edit modes", () => {
    expect(pickModel({ unifiedMode: "agent" }, ai)).toBe("claude-4-sonnet");
    expect(pickModel({ forceMode: "edit" }, ai)).toBe("claude-4-sonnet");
  });
  it("uses regularChatModel in chat mode", () => {
    expect(pickModel({ unifiedMode: "chat" }, ai)).toBe("claude-4-sonnet-thinking");
  });
  it("falls back between fields when one is missing", () => {
    expect(pickModel({ unifiedMode: "chat" }, { composerModel: "x" })).toBe("x");
    expect(pickModel({ unifiedMode: "agent" }, { regularChatModel: "y" })).toBe("y");
  });
  it("returns undefined if nothing is set", () => {
    expect(pickModel({ unifiedMode: "agent" }, {})).toBeUndefined();
  });
});

describe("interpolateTurnTs", () => {
  it("returns distinct monotonic timestamps across turns", () => {
    const start = 1_000_000;
    const end = 2_000_000;
    const ts = [0, 1, 2, 3, 4].map(i => interpolateTurnTs(start, end, i, 5).getTime());
    // strictly increasing
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
    // first == start (plus the +i disambiguator = 0); last == end (plus +n-1)
    expect(ts[0]).toBe(start);
    expect(ts[ts.length - 1]).toBe(end + 4);
  });
  it("handles a single-turn session", () => {
    const s = 42;
    const t = interpolateTurnTs(s, s + 1000, 0, 1);
    expect(t.getTime()).toBe(s);
  });
  it("stays monotonic even when span is zero (instantaneous session)", () => {
    const ts = [0, 1, 2].map(i => interpolateTurnTs(100, 100, i, 3).getTime());
    expect(ts).toEqual([100, 101, 102]);
  });
});

describe("buildCursorSessionState", () => {
  const cd: CursorComposer = {
    composerId: "756acbd7-47fa-4fcc-92bb-1175276c3cbf",
    createdAt: 1_700_000_000_000,
    lastUpdatedAt: 1_700_000_060_000,
    status: "completed",
    unifiedMode: "agent",
    forceMode: "edit",
    fullConversationHeadersOnly: [
      { bubbleId: "b0", type: 1 },
      { bubbleId: "b1", type: 2 },
      { bubbleId: "b2", type: 2 },
      { bubbleId: "b3", type: 1 },
      { bubbleId: "b4", type: 2 },
    ],
    originalFileStates: {
      "file:///Users/me/foo.ts": {},
      "file:///Users/me/dir%20with%20spaces/bar.md": {},
    },
    newlyCreatedFiles: ["/Users/me/new.ts"],
  };
  const bubblesOrdered: CursorBubble[] = [
    { type: 1, text: "please fix this broken build", tokenCount: null },
    { type: 2, text: "", tokenCount: { inputTokens: 100, outputTokens: 50 }, toolFormerData: { name: "read_file", status: "completed" } },
    { type: 2, text: "here is what I found", tokenCount: { inputTokens: 200, outputTokens: 80 } },
    { type: 1, text: "nope that's wrong, undo it" },
    { type: 2, text: "", toolFormerData: { name: "search_replace", status: "error" } },
  ];
  // Plus one orphan bubble that the ordering doesn't reference.
  const orphan: CursorBubble = {
    type: 2,
    text: "",
    tokenCount: { inputTokens: 5, outputTokens: 3 },
    toolFormerData: { name: "read_file", status: "completed" },
  };
  const bubblesAll = [...bubblesOrdered, orphan];

  const s = buildCursorSessionState(cd, bubblesOrdered, bubblesAll, "/Users/me/repo", "claude-4-sonnet");

  it("sets identity + timing fields", () => {
    expect(s.sid).toBe(cd.composerId);
    expect(s.cwd).toBe("/Users/me/repo");
    expect(s.model).toBe("claude-4-sonnet");
    expect(s.start?.getTime()).toBe(cd.createdAt);
    expect(s.end?.getTime()).toBe(cd.lastUpdatedAt);
  });

  it("aggregates tokens across ALL bubbles (including orphans)", () => {
    expect(s.tokensIn).toBe(100 + 200 + 5);
    expect(s.tokensOut).toBe(50 + 80 + 3);
    // Cursor does not expose these — honest zero.
    expect(s.tokensCacheRead).toBe(0);
    expect(s.tokensCacheWrite).toBe(0);
    expect(s.tokensReasoning).toBe(0);
  });

  it("counts messages (assistant text replies) and tool errors", () => {
    // only the one assistant bubble with non-empty text counts
    expect(s.messages).toBe(1);
    // one tool with status=error, plus none from orphan
    expect(s.errors).toBe(1);
    // tool histogram includes orphan (2x read_file, 1x search_replace)
    expect(s.toolHist).toEqual({ read_file: 2, search_replace: 1 });
  });

  it("counts user turns only from the ordered conversation", () => {
    expect(s.userTurns).toBe(2);
    expect(s.promptWords).toHaveLength(2);
    expect(s.intents).toHaveProperty("bugfix");  // "please fix this broken build"
    expect(s.prompts).toHaveLength(2);
    // prompt timestamps are distinct and in-span
    const t0 = s.prompts[0].ts.getTime();
    const t1 = s.prompts[1].ts.getTime();
    expect(t0).toBeGreaterThanOrEqual(cd.createdAt!);
    expect(t1).toBeGreaterThan(t0);
    expect(t1).toBeLessThanOrEqual(cd.lastUpdatedAt! + 5);
  });

  it("detects frustration + teacher signals", () => {
    // "nope that's wrong, undo it" hits TEACHER_RE and is short enough
    expect(s.teacherMoments).toBe(1);
  });

  it("decodes file:// URIs and includes newlyCreatedFiles in filesEdited", () => {
    const files = [...s.filesEdited].sort();
    expect(files).toContain("/Users/me/foo.ts");
    expect(files).toContain("/Users/me/dir with spaces/bar.md");
    expect(files).toContain("/Users/me/new.ts");
  });

  it("marks isSidechain=false and leaves skills/mcps empty", () => {
    expect(s.isSidechain).toBe(false);
    expect([...s.skillsUsed]).toEqual([]);
    expect([...s.mcpsUsed]).toEqual([]);
  });
});
