import { describe, it, expect } from "vitest";
import { scoreLineage, type PrCommit } from "@/lib/lineage/score";

const baseSession = {
  startedAt: new Date("2026-05-13T10:00:00Z"),
  endedAt: new Date("2026-05-13T11:00:00Z"),
  filesEdited: ["apps/web/app/page.tsx", "apps/web/lib/x.ts"],
  branch: "feat/x",
  cwdResolvedRepo: "pella-labs/pellametric",
};

const basePr = {
  repo: "pella-labs/pellametric",
  fileList: ["apps/web/app/page.tsx", "apps/web/lib/x.ts"],
  createdAt: new Date("2026-05-13T09:30:00Z"),
  mergedAt: new Date("2026-05-13T12:00:00Z"),
  headBranch: "feat/x",
};

describe("scoreLineage", () => {
  it("high confidence on full signal alignment", () => {
    const commit: PrCommit = {
      sha: "abc",
      kind: "commit",
      authorLogin: "walid",
      authoredAt: new Date("2026-05-13T10:30:00Z"),
    };
    const r = scoreLineage(baseSession, basePr, [commit], "walid");
    expect(r.bucket).toBe("high");
    expect(r.cwdMatch).toBe(true);
    expect(r.fileJaccard).toBeGreaterThan(0.9);
    expect(r.branchMatch).toBe(true);
    expect(r.commitAuthorship).toBe(true);
  });

  it("drops when cwd resolves to wrong repo", () => {
    const r = scoreLineage(
      { ...baseSession, cwdResolvedRepo: "other/repo" },
      basePr,
      [],
      "walid",
    );
    expect(r.score).toBe(0);
    expect(r.bucket).toBe("drop");
  });

  it("0.6 soft gate when cwd is unknown (null)", () => {
    const r = scoreLineage(
      { ...baseSession, cwdResolvedRepo: null },
      basePr,
      [],
      "walid",
    );
    expect(r.reasonBreakdown.cwdMatch).toBe(0.6);
  });

  it("threshold exception lowers floor for cwd+authorship combo", () => {
    // Make jaccard low and time misaligned so score is small but above 0.10.
    const lowSignalSession = {
      ...baseSession,
      filesEdited: ["unrelated.md"],
      endedAt: new Date("2026-05-12T00:00:00Z"),
      branch: null,
    };
    const commit: PrCommit = {
      sha: "abc",
      kind: "commit",
      authorLogin: "walid",
      authoredAt: new Date("2026-05-12T00:00:00Z"),
    };
    const r = scoreLineage(
      { ...lowSignalSession, startedAt: new Date("2026-05-11T23:00:00Z") },
      basePr,
      [commit],
      "walid",
    );
    expect(r.reasonBreakdown.appliedException).toBe(true);
  });
});
