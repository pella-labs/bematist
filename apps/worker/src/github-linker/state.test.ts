// Unit tests for `computeLinkerState` + `resolveEligibility`.
// Pure-function tests, zero I/O — one per input-dimension + eligibility modes.

import { describe, expect, test } from "bun:test";
import { assertEvidenceSafe, computeLinkerState, type LinkerInputs } from "./state";

const SHA = (n: number): string => n.toString(16).padStart(40, "0");
const UUID = (n: number): string => `00000000-0000-0000-0000-${n.toString(16).padStart(12, "0")}`;
const CLOCK = { now: () => "2026-04-18T12:00:00.000Z" };
const HASH = (tag: string): Buffer => {
  const b = Buffer.alloc(32);
  Buffer.from(tag).copy(b);
  return b;
};

function baseInputs(overrides: Partial<LinkerInputs> = {}): LinkerInputs {
  return {
    tenant_id: UUID(1),
    tenant_mode: "all",
    installations: [{ installation_id: "inst-1", status: "active" }],
    repos: [{ provider_repo_id: "r1", tracking_state: "inherit" }],
    session: {
      session_id: UUID(2),
      direct_provider_repo_ids: ["r1"],
      commit_shas: [],
      pr_numbers: [],
    },
    pull_requests: [],
    deployments: [],
    aliases: [],
    tombstones: [],
    ...overrides,
  };
}

describe("computeLinkerState — per-input-dimension", () => {
  test("empty inputs → no links, ineligible, branch_only_session=true", () => {
    const inp = baseInputs({
      session: {
        session_id: UUID(2),
        direct_provider_repo_ids: [],
        commit_shas: [],
        pr_numbers: [],
      },
      repos: [],
    });
    const out = computeLinkerState(inp, CLOCK);
    expect(out.links).toHaveLength(0);
    expect(out.eligibility.eligible).toBe(false);
    expect(out.eligibility.eligibility_reasons).toMatchObject({ branch_only_session: true });
  });

  test("direct_repo only → 1 link, eligible under mode=all", () => {
    const out = computeLinkerState(baseInputs(), CLOCK);
    expect(out.links).toHaveLength(1);
    expect(out.links[0]!.match_reason).toBe("direct_repo");
    expect(out.eligibility.eligible).toBe(true);
  });

  test("commit_link only via PR head_sha", () => {
    const inp = baseInputs({
      session: {
        session_id: UUID(2),
        direct_provider_repo_ids: [],
        commit_shas: [SHA(1)],
        pr_numbers: [],
      },
      pull_requests: [
        {
          provider_repo_id: "r1",
          pr_number: 10,
          head_sha: SHA(1),
          merge_commit_sha: null,
          state: "open",
          from_fork: false,
          title_hash: HASH("t"),
          author_login_hash: HASH("a"),
          additions: 0,
          deletions: 0,
          changed_files: 0,
        },
      ],
    });
    const out = computeLinkerState(inp, CLOCK);
    expect(out.links).toHaveLength(1);
    expect(out.links[0]!.match_reason).toBe("commit_link");
  });

  test("pr_link produces separate row from commit_link for same PR", () => {
    const inp = baseInputs({
      session: {
        session_id: UUID(2),
        direct_provider_repo_ids: [],
        commit_shas: [SHA(1)],
        pr_numbers: [10],
      },
      pull_requests: [
        {
          provider_repo_id: "r1",
          pr_number: 10,
          head_sha: SHA(1),
          merge_commit_sha: null,
          state: "open",
          from_fork: false,
          title_hash: HASH("t"),
          author_login_hash: HASH("a"),
          additions: 0,
          deletions: 0,
          changed_files: 0,
        },
      ],
    });
    const out = computeLinkerState(inp, CLOCK);
    const reasons = out.links.map((l) => l.match_reason).sort();
    expect(reasons).toEqual(["commit_link", "pr_link"]);
  });

  test("deployment_link on sha intersection", () => {
    const inp = baseInputs({
      session: {
        session_id: UUID(2),
        direct_provider_repo_ids: [],
        commit_shas: [SHA(9)],
        pr_numbers: [],
      },
      deployments: [
        {
          provider_repo_id: "r1",
          deployment_id: "d-1",
          sha: SHA(9),
          environment: "prod",
          status: "success",
        },
      ],
    });
    const out = computeLinkerState(inp, CLOCK);
    expect(out.links).toHaveLength(1);
    expect(out.links[0]!.match_reason).toBe("deployment_link");
  });

  test("force-push tombstone excludes SHA from commit_link", () => {
    const inp = baseInputs({
      session: {
        session_id: UUID(2),
        direct_provider_repo_ids: [],
        commit_shas: [SHA(5)],
        pr_numbers: [],
      },
      pull_requests: [
        {
          provider_repo_id: "r1",
          pr_number: 1,
          head_sha: SHA(5),
          merge_commit_sha: null,
          state: "open",
          from_fork: false,
          title_hash: HASH("t"),
          author_login_hash: HASH("a"),
          additions: 0,
          deletions: 0,
          changed_files: 0,
        },
      ],
      tombstones: [{ provider_repo_id: "r1", excluded_shas: [SHA(5)] }],
    });
    const out = computeLinkerState(inp, CLOCK);
    expect(out.links).toHaveLength(0);
    expect(out.eligibility.eligible).toBe(false);
  });

  test("installation suspend → links flagged stale_at", () => {
    const inp = baseInputs({ installation_status: "suspended" });
    const out = computeLinkerState(inp, CLOCK);
    expect(out.links).toHaveLength(1);
    expect(out.links[0]!.stale_at).not.toBeNull();
  });

  test("unknown repo is ignored even when PR matches SHA", () => {
    const inp = baseInputs({
      repos: [{ provider_repo_id: "r1", tracking_state: "inherit" }],
      session: {
        session_id: UUID(2),
        direct_provider_repo_ids: [],
        commit_shas: [SHA(7)],
        pr_numbers: [],
      },
      pull_requests: [
        {
          provider_repo_id: "unknown",
          pr_number: 1,
          head_sha: SHA(7),
          merge_commit_sha: null,
          state: "open",
          from_fork: false,
          title_hash: HASH("t"),
          author_login_hash: HASH("a"),
          additions: 0,
          deletions: 0,
          changed_files: 0,
        },
      ],
    });
    const out = computeLinkerState(inp, CLOCK);
    expect(out.links).toHaveLength(0);
  });
});

describe("resolveEligibility — PRD §13 3 modes + branch-only", () => {
  test("mode=all: inherit resolves to included → eligible", () => {
    const inp = baseInputs({ tenant_mode: "all" });
    const out = computeLinkerState(inp, CLOCK);
    expect(out.eligibility.eligible).toBe(true);
    expect(out.eligibility.eligibility_reasons).toMatchObject({ mode: "all" });
  });

  test("mode=all: explicitly excluded repo → not eligible", () => {
    const inp = baseInputs({
      tenant_mode: "all",
      repos: [{ provider_repo_id: "r1", tracking_state: "excluded" }],
    });
    const out = computeLinkerState(inp, CLOCK);
    expect(out.eligibility.eligible).toBe(false);
  });

  test("mode=selected: inherit → excluded → not eligible", () => {
    const inp = baseInputs({
      tenant_mode: "selected",
      repos: [{ provider_repo_id: "r1", tracking_state: "inherit" }],
    });
    const out = computeLinkerState(inp, CLOCK);
    expect(out.eligibility.eligible).toBe(false);
  });

  test("mode=selected: tracking_state='included' → eligible", () => {
    const inp = baseInputs({
      tenant_mode: "selected",
      repos: [{ provider_repo_id: "r1", tracking_state: "included" }],
    });
    const out = computeLinkerState(inp, CLOCK);
    expect(out.eligibility.eligible).toBe(true);
  });

  test("branch-only session (no overlap) → ineligible", () => {
    const inp = baseInputs({
      session: {
        session_id: UUID(2),
        direct_provider_repo_ids: [],
        commit_shas: [],
        pr_numbers: [],
      },
    });
    const out = computeLinkerState(inp, CLOCK);
    expect(out.eligibility.eligible).toBe(false);
    expect(out.eligibility.eligibility_reasons).toMatchObject({ branch_only_session: true });
  });
});

describe("assertEvidenceSafe — D57 forbidden-field gate", () => {
  test("safe evidence passes", () => {
    expect(() =>
      assertEvidenceSafe({ pr_number: 1, title_hash_hex: "ab", matched_sha_count: 1 }),
    ).not.toThrow();
  });
  test("raw title field rejected", () => {
    expect(() => assertEvidenceSafe({ title: "fix the bug" })).toThrow(/forbidden evidence field/);
  });
  test("raw login field rejected", () => {
    expect(() => assertEvidenceSafe({ login: "octocat" })).toThrow(/forbidden evidence field/);
  });
  test("title_hash_hex allowed (suffix)", () => {
    expect(() => assertEvidenceSafe({ title_hash_hex: "abcd" })).not.toThrow();
  });
  test("overly long string rejected", () => {
    const long = "a".repeat(257);
    expect(() => assertEvidenceSafe({ generic: long })).toThrow(/exceeds 256-char budget/);
  });
});
