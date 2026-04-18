import { assertRole, type Ctx } from "../auth";
import { useFixtures } from "../env";
import type {
  PerCommitOutcome,
  PerCommitOutcomesInput,
  PerCommitOutcomesOutput,
  PerDevOutcome,
  PerDevOutcomesInput,
  PerDevOutcomesOutput,
  PerPROutcome,
  PerPROutcomesInput,
  PerPROutcomesOutput,
} from "../schemas/outcomes";

/**
 * Per-engineer outcome aggregate for a team/window. Raw rows carry a stable
 * 8-char hash; names only render when an IC has opted in upstream. Callers
 * must also apply the k≥5 cohort floor for team-level tiles — we return
 * `cohort_size` so the UI can pick the right suppression banner.
 *
 * Dual-mode:
 *   - `USE_FIXTURES=0` reads the `dev_daily_rollup` MV joined with
 *     `outcome_daily_rollup`.
 *   - Otherwise (default) deterministic fixture rows.
 */
export async function perDevOutcomes(
  ctx: Ctx,
  input: PerDevOutcomesInput,
): Promise<PerDevOutcomesOutput> {
  assertRole(ctx, ["admin", "manager", "viewer"]);
  if (useFixtures()) return perDevOutcomesFixture(ctx, input);
  return perDevOutcomesReal(ctx, input);
}

async function perDevOutcomesFixture(
  ctx: Ctx,
  input: PerDevOutcomesInput,
): Promise<PerDevOutcomesOutput> {
  const seed = hash(`${ctx.tenant_id}|perDev|${input.team_id ?? "_"}|${input.window}`);
  const cohortSize = 6 + (seed % 8);
  const rowCount = Math.min(cohortSize, input.limit);
  const rows: PerDevOutcome[] = [];

  for (let i = 0; i < rowCount; i++) {
    const r = (n: number) => rand(seed + i * 11, n);
    const engineerId = `dev-${(seed + i * 17).toString(16).slice(-6)}`;
    const sessions = 10 + Math.floor(r(1) * 90);
    const cost = round2(sessions * (0.25 + r(2) * 2.5));
    const accepted = Math.floor(sessions * (0.4 + r(3) * 0.5));
    const retained = Math.floor(accepted * (0.7 + r(4) * 0.28));
    const mergedPrs = Math.floor(sessions * (0.05 + r(5) * 0.12));
    const greenTests = Math.floor(sessions * (0.08 + r(6) * 0.18));
    const reverts = Math.floor(sessions * r(7) * 0.05);
    rows.push({
      engineer_id: engineerId,
      engineer_id_hash: hash8(`${ctx.tenant_id}:${engineerId}`),
      sessions,
      cost_usd: cost,
      accepted_edits: accepted,
      accepted_and_retained: retained,
      merged_prs: mergedPrs,
      green_tests: greenTests,
      reverts,
    });
  }

  rows.sort((a, b) => b.cost_usd - a.cost_usd);

  return {
    window: input.window,
    team_id: input.team_id ?? null,
    rows,
    cohort_size: cohortSize,
  };
}

/**
 * Real-branch read.
 *
 * EXPLAIN: `dev_daily_rollup` is an AggregatingMergeTree ORDER BY
 * (org_id, engineer_id, day). State columns (`sessions_state`,
 * `cost_usd_state`, `accepted_edits_state`, `accepted_retained_edits_state`)
 * MUST be read with the matching `*Merge` finalizer; raw `sum()` errors on
 * AggregateFunction columns. `team_id` isn't on this MV (only on
 * team_weekly_rollup via dev_team_dict) — the team filter is dropped here
 * until D1-05 wires teams into developers + dev_team_dict refresh lands.
 * `merged_prs` / `green_tests` / `reverts` / `engineer_id_hash` aren't
 * materialized yet either; zero-fill so the table renders rather than 500.
 *
 * TIER-A ALLOWLIST: aggregates only; no prompt_text / tool_input /
 * tool_output / messages / toolArgs / toolOutputs / fileContents / diffs /
 * filePaths / ticketIds / emails / realNames.
 */
async function perDevOutcomesReal(
  ctx: Ctx,
  input: PerDevOutcomesInput,
): Promise<PerDevOutcomesOutput> {
  const days = WINDOW_DAYS[input.window];

  const clauses = ["org_id = {tenant_id:String}", "day >= today() - {days:UInt16}"];
  const params: Record<string, unknown> = {
    tenant_id: ctx.tenant_id,
    days,
    limit: input.limit,
  };

  const rows = await ctx.db.ch.query<{
    engineer_id: string;
    engineer_id_hash: string;
    sessions: number;
    cost_usd: number;
    accepted_edits: number;
    accepted_and_retained: number;
    merged_prs: number;
    green_tests: number;
    reverts: number;
  }>(
    `SELECT
       engineer_id,
       substring(lower(hex(cityHash64(engineer_id))), 1, 8) AS engineer_id_hash,
       uniqMerge(sessions_state) AS sessions,
       sumMerge(cost_usd_state) AS cost_usd,
       countIfMerge(accepted_edits_state) AS accepted_edits,
       countIfMerge(accepted_retained_edits_state) AS accepted_and_retained,
       0 AS merged_prs,
       0 AS green_tests,
       0 AS reverts
     FROM dev_daily_rollup
     WHERE ${clauses.join(" AND ")}
     GROUP BY engineer_id
     ORDER BY cost_usd DESC
     LIMIT {limit:UInt32}`,
    params,
  );

  const cohortRows = await ctx.db.ch.query<{ cohort_size: number }>(
    `SELECT uniqExact(engineer_id) AS cohort_size
       FROM dev_daily_rollup
      WHERE ${clauses.join(" AND ")}`,
    params,
  );

  return {
    window: input.window,
    team_id: input.team_id ?? null,
    rows: rows.map((r) => ({
      engineer_id: r.engineer_id,
      engineer_id_hash: r.engineer_id_hash,
      sessions: Number(r.sessions),
      cost_usd: round2(Number(r.cost_usd)),
      accepted_edits: Number(r.accepted_edits),
      accepted_and_retained: Number(r.accepted_and_retained),
      merged_prs: Number(r.merged_prs),
      green_tests: Number(r.green_tests),
      reverts: Number(r.reverts),
    })),
    cohort_size: Number(cohortRows[0]?.cohort_size ?? 0),
  };
}

/**
 * PR-level outcomes for a repo/window.
 */
export async function perPROutcomes(
  ctx: Ctx,
  input: PerPROutcomesInput,
): Promise<PerPROutcomesOutput> {
  assertRole(ctx, ["admin", "manager", "engineer", "viewer"]);
  if (useFixtures()) return perPROutcomesFixture(ctx, input);
  return perPROutcomesReal(ctx, input);
}

async function perPROutcomesFixture(
  ctx: Ctx,
  input: PerPROutcomesInput,
): Promise<PerPROutcomesOutput> {
  const seed = hash(`${ctx.tenant_id}|perPR|${input.repo ?? "_"}|${input.window}`);
  const rowCount = Math.min(input.limit, 80);
  const repoName = input.repo ?? "acme/backend";

  const rows: PerPROutcome[] = [];
  for (let i = 0; i < rowCount; i++) {
    const r = (n: number) => rand(seed + i * 7, n);
    const reverted = r(1) < 0.04;
    const aiAssisted = r(2) < 0.68;
    const edits = aiAssisted ? 2 + Math.floor(r(3) * 22) : 0;
    rows.push({
      repo: repoName,
      pr_number: 2000 + i,
      merged_at: new Date(Date.UTC(2026, 3, 16, 12) - i * 60 * 60 * 1000).toISOString(),
      cost_usd: round2(aiAssisted ? 0.4 + r(4) * 6.5 : 0),
      accepted_edit_count: edits,
      reverted,
      ai_assisted: aiAssisted,
    });
  }

  const totals = rows.reduce(
    (acc, row) => {
      acc.prs += 1;
      acc.cost_usd = round2(acc.cost_usd + row.cost_usd);
      if (row.reverted) acc.reverted_prs += 1;
      if (row.ai_assisted) acc.ai_assisted_prs += 1;
      return acc;
    },
    { prs: 0, cost_usd: 0, reverted_prs: 0, ai_assisted_prs: 0 },
  );

  return {
    window: input.window,
    repo: input.repo ?? null,
    rows,
    totals,
  };
}

/**
 * Real-branch read.
 *
 * EXPLAIN: `pr_outcome_rollup` is an AggregatingMergeTree ORDER BY
 * (org_id, repo, pr_number, day). Rows split across UTC day boundaries when a
 * PR spans midnight; `*Merge` folds the per-day states back at read time.
 * The `ai_assisted` flag lifts via maxMerge — the PR trips the flag if any
 * agent accept event landed. `reverted` sums the `revert_within_24h`
 * signal across events (non-zero ⇒ reverted). `merged_at` surfaces
 * `maxMerge(last_ts_state)` — proxy for the Postgres `git_events.merged_at`
 * until the control-plane join lands.
 *
 * TIER-A ALLOWLIST: aggregates only; no prompt_text / tool_input /
 * tool_output / messages / toolArgs / toolOutputs / fileContents / diffs /
 * filePaths / ticketIds / emails / realNames.
 */
async function perPROutcomesReal(
  ctx: Ctx,
  input: PerPROutcomesInput,
): Promise<PerPROutcomesOutput> {
  const days = WINDOW_DAYS[input.window];

  const clauses = ["org_id = {tenant_id:String}", "day >= today() - {days:UInt16}"];
  const params: Record<string, unknown> = {
    tenant_id: ctx.tenant_id,
    days,
    limit: input.limit,
  };
  if (input.repo) {
    clauses.push("repo = {repo:String}");
    params.repo = input.repo;
  }

  const rows = await ctx.db.ch.query<{
    repo: string;
    pr_number: number;
    merged_at: string;
    cost_usd: number;
    accepted_edit_count: number;
    reverted: number;
    ai_assisted: number;
  }>(
    `SELECT
       repo,
       pr_number,
       maxMerge(last_ts_state) AS merged_at,
       sumMerge(cost_usd_state) AS cost_usd,
       countIfMerge(accepted_edit_count_state) AS accepted_edit_count,
       sumMerge(revert_count_state) AS reverted,
       maxMerge(ai_assisted_flag_state) AS ai_assisted
     FROM pr_outcome_rollup
     WHERE ${clauses.join(" AND ")}
     GROUP BY repo, pr_number
     ORDER BY merged_at DESC
     LIMIT {limit:UInt32}`,
    params,
  );

  const parsed: PerPROutcome[] = rows.map((r) => ({
    repo: r.repo,
    pr_number: Number(r.pr_number),
    merged_at: new Date(r.merged_at).toISOString(),
    cost_usd: round2(Number(r.cost_usd)),
    accepted_edit_count: Number(r.accepted_edit_count),
    reverted: Number(r.reverted) > 0,
    ai_assisted: Number(r.ai_assisted) > 0,
  }));

  const totals = parsed.reduce(
    (acc, row) => {
      acc.prs += 1;
      acc.cost_usd = round2(acc.cost_usd + row.cost_usd);
      if (row.reverted) acc.reverted_prs += 1;
      if (row.ai_assisted) acc.ai_assisted_prs += 1;
      return acc;
    },
    { prs: 0, cost_usd: 0, reverted_prs: 0, ai_assisted_prs: 0 },
  );

  return {
    window: input.window,
    repo: input.repo ?? null,
    rows: parsed,
    totals,
  };
}

/**
 * Per-commit outcome rows. Fine-grained — useful for the CLI's `bematist
 * outcomes` drill-in. Author identity is always a hash; names live in `/me`
 * under the IC's own control.
 */
export async function perCommitOutcomes(
  ctx: Ctx,
  input: PerCommitOutcomesInput,
): Promise<PerCommitOutcomesOutput> {
  assertRole(ctx, ["admin", "manager", "engineer", "viewer"]);
  if (useFixtures()) return perCommitOutcomesFixture(ctx, input);
  return perCommitOutcomesReal(ctx, input);
}

async function perCommitOutcomesFixture(
  ctx: Ctx,
  input: PerCommitOutcomesInput,
): Promise<PerCommitOutcomesOutput> {
  const seed = hash(`${ctx.tenant_id}|perCommit|${input.repo ?? "_"}|${input.window}`);
  const rowCount = Math.min(input.limit, 120);
  const repoName = input.repo ?? "acme/backend";

  const rows: PerCommitOutcome[] = [];
  for (let i = 0; i < rowCount; i++) {
    const r = (n: number) => rand(seed + i * 13, n);
    const aiAssisted = r(1) < 0.55;
    rows.push({
      repo: repoName,
      commit_sha: hexSha(seed + i * 19),
      pr_number: r(2) < 0.78 ? 2000 + Math.floor(r(3) * 80) : null,
      author_engineer_id_hash: hash8(`${ctx.tenant_id}:${Math.floor(r(4) * 12)}`),
      ts: new Date(Date.UTC(2026, 3, 16, 10) - i * 30 * 60 * 1000).toISOString(),
      cost_usd_attributed: aiAssisted ? round2(0.05 + r(5) * 1.8) : 0,
      ai_assisted: aiAssisted,
      reverted: r(6) < 0.02,
    });
  }

  return {
    window: input.window,
    repo: input.repo ?? null,
    rows,
  };
}

/**
 * Real-branch read.
 *
 * EXPLAIN: `commit_outcome_rollup` is an AggregatingMergeTree ORDER BY
 * (org_id, repo, commit_sha, day). Partitioned by month so GDPR DROP
 * PARTITION cascades cleanly. `pr_number` is derived via anyMerge — a commit
 * generally attaches to a single PR; the `any` aggregator collapses the rare
 * merge/cherry-pick case where the same sha is attributed across days.
 * `author_engineer_id_hash` is already pre-hashed in the MV (cityHash64 →
 * 8-char hex) so the read path never sees raw engineer_id against a commit.
 *
 * TIER-A ALLOWLIST: aggregates only; no prompt_text / tool_input /
 * tool_output / messages / toolArgs / toolOutputs / fileContents / diffs /
 * filePaths / ticketIds / emails / realNames.
 */
async function perCommitOutcomesReal(
  ctx: Ctx,
  input: PerCommitOutcomesInput,
): Promise<PerCommitOutcomesOutput> {
  const days = WINDOW_DAYS[input.window];

  const clauses = ["org_id = {tenant_id:String}", "day >= today() - {days:UInt16}"];
  const params: Record<string, unknown> = {
    tenant_id: ctx.tenant_id,
    days,
    limit: input.limit,
  };
  if (input.repo) {
    clauses.push("repo = {repo:String}");
    params.repo = input.repo;
  }

  const rows = await ctx.db.ch.query<{
    repo: string;
    commit_sha: string;
    pr_number: number | null;
    author_engineer_id_hash: string;
    ts: string;
    cost_usd_attributed: number;
    ai_assisted: number;
    reverted: number;
  }>(
    `SELECT
       repo,
       commit_sha,
       anyMerge(pr_number_any_state) AS pr_number,
       author_engineer_id_hash,
       maxMerge(last_ts_state) AS ts,
       sumMerge(cost_usd_attributed_state) AS cost_usd_attributed,
       maxMerge(ai_assisted_flag_state) AS ai_assisted,
       sumMerge(revert_count_state) AS reverted
     FROM commit_outcome_rollup
     WHERE ${clauses.join(" AND ")}
     GROUP BY repo, commit_sha, author_engineer_id_hash
     ORDER BY ts DESC
     LIMIT {limit:UInt32}`,
    params,
  );

  return {
    window: input.window,
    repo: input.repo ?? null,
    rows: rows.map((r) => ({
      repo: r.repo,
      commit_sha: r.commit_sha,
      pr_number: r.pr_number != null ? Number(r.pr_number) : null,
      author_engineer_id_hash: r.author_engineer_id_hash,
      ts: new Date(r.ts).toISOString(),
      cost_usd_attributed: round2(Number(r.cost_usd_attributed)),
      ai_assisted: Number(r.ai_assisted) > 0,
      reverted: Number(r.reverted) > 0,
    })),
  };
}

const WINDOW_DAYS: Record<"7d" | "30d" | "90d", number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hash8(s: string): string {
  return hash(s).toString(16).padStart(8, "0").slice(0, 8);
}

function hexSha(seed: number): string {
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += ((Math.imul(seed + i, 0x1b873593) >>> 0) & 0xffffffff).toString(16).padStart(8, "0");
  }
  return out.slice(0, 40);
}

function rand(seed: number, n: number): number {
  const x = Math.sin(seed + n * 17.13) * 10000;
  return x - Math.floor(x);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
