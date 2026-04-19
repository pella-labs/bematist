// Real `loadInputs` resolver for the linker consumer (PRD §10, B4b).
//
// Given (tenant_id, session_id), assemble a `LinkerInputs` object from:
//   - Postgres: orgs.github_repo_tracking_mode + deleted_at, github_installations
//     (active only), repos, github_pull_requests ∩ (session shas | pr_numbers),
//     github_deployments ∩ session shas, repo_id_hash_aliases (archived_at IS NULL).
//   - ClickHouse: SELECT DISTINCT commit_sha, pr_number FROM events
//     WHERE org_id=$1 AND session_id=$2.
//
// Force-push tombstones: no Postgres table exists yet (G3 follow-up), so we
// return `tombstones: []`. The pure-function state computer handles an empty
// array correctly — ranges only apply when a tombstone row is present.
//
// Returns `null` ONLY when the `orgs` row is absent (tenant hard-deleted via
// GDPR cascade). The schema has no `deleted_at` column on orgs today — CLAUDE.md
// §GDPR says erasure is `DROP PARTITION` + row delete, not a soft-delete flag.
// Missing session events is NOT a null case — we return inputs with empty
// session shas so the consumer emits an eligibility row with reasons
// `{branch_only_session:true}` rather than crashing.

import type { ClickHouseClient } from "@clickhouse/client";
import type { Sql } from "postgres";
import { defaultTenantSalt } from "./hash";
import type {
  Alias,
  Deployment,
  Installation,
  LinkerInputs,
  PullRequest,
  Repo,
  TrackingMode,
} from "./state";

export interface LoadInputsDeps {
  sql: Sql;
  ch: ClickHouseClient;
}

export async function loadInputs(
  deps: LoadInputsDeps,
  tenantId: string,
  sessionId: string,
): Promise<LinkerInputs | null> {
  const { sql, ch } = deps;

  const orgRows = (await sql.unsafe(
    `SELECT github_repo_tracking_mode FROM orgs WHERE id = $1 LIMIT 1`,
    [tenantId],
  )) as unknown as Array<{ github_repo_tracking_mode: string }>;
  const org = orgRows[0];
  if (!org) return null;
  const tenantMode: TrackingMode =
    org.github_repo_tracking_mode === "selected" ? "selected" : "all";

  const installationRows = (await sql.unsafe(
    `SELECT installation_id::text AS installation_id, status
       FROM github_installations
      WHERE tenant_id = $1 AND status = 'active'`,
    [tenantId],
  )) as unknown as Array<{ installation_id: string; status: string }>;
  const installations: Installation[] = installationRows.map((r) => ({
    installation_id: r.installation_id,
    status: normalizeInstallationStatus(r.status),
  }));

  const repoRows = (await sql.unsafe(
    `SELECT provider_repo_id, tracking_state, repo_id_hash
       FROM repos
      WHERE org_id = $1
        AND provider = 'github'
        AND deleted_at IS NULL
        AND provider_repo_id IS NOT NULL`,
    [tenantId],
  )) as unknown as Array<{
    provider_repo_id: string;
    tracking_state: string;
    repo_id_hash: Buffer | string | null;
  }>;
  const repos: Repo[] = repoRows.map((r) => ({
    provider_repo_id: r.provider_repo_id,
    tracking_state: normalizeTrackingState(r.tracking_state),
    ...(r.repo_id_hash !== null ? { stored_repo_id_hash: r.repo_id_hash } : {}),
  }));

  const { commit_shas, pr_numbers } = await loadSessionShas(ch, tenantId, sessionId);

  const pullRequests =
    commit_shas.length > 0 || pr_numbers.length > 0
      ? await loadPullRequests(sql, tenantId, commit_shas, pr_numbers)
      : [];

  const deployments =
    commit_shas.length > 0 ? await loadDeployments(sql, tenantId, commit_shas) : [];

  const aliases = await loadAliases(sql, tenantId);

  // Governing installation_status: the tenant has 0..N installations. We pick
  // the first active one for lifecycle gating; if NONE are active we fall
  // through to `undefined` (no suspend-stale behavior).
  const installationStatus: Installation["status"] | undefined =
    installations[0]?.status ?? undefined;

  return {
    tenant_id: tenantId,
    tenant_mode: tenantMode,
    installations,
    repos,
    session: {
      session_id: sessionId,
      direct_provider_repo_ids: [],
      commit_shas,
      pr_numbers,
    },
    pull_requests: pullRequests,
    deployments,
    aliases,
    tombstones: [],
    ...(installationStatus ? { installation_status: installationStatus } : {}),
    tenant_salt: defaultTenantSalt(tenantId),
  };
}

function normalizeInstallationStatus(raw: string): Installation["status"] {
  if (raw === "active" || raw === "suspended" || raw === "revoked" || raw === "reconnecting") {
    return raw;
  }
  return "active";
}

function normalizeTrackingState(raw: string): Repo["tracking_state"] {
  if (raw === "inherit" || raw === "included" || raw === "excluded") return raw;
  return "inherit";
}

async function loadSessionShas(
  ch: ClickHouseClient,
  tenantId: string,
  sessionId: string,
): Promise<{ commit_shas: string[]; pr_numbers: number[] }> {
  const res = await ch.query({
    query: `SELECT DISTINCT commit_sha, pr_number
              FROM events
             WHERE org_id = {tid:String}
               AND session_id = {sid:String}
               AND (commit_sha IS NOT NULL OR pr_number IS NOT NULL)`,
    query_params: { tid: tenantId, sid: sessionId },
    format: "JSONEachRow",
  });
  const rows = (await res.json()) as Array<{
    commit_sha: string | null;
    pr_number: number | null;
  }>;
  const shaSet = new Set<string>();
  const prSet = new Set<number>();
  for (const r of rows) {
    if (r.commit_sha) shaSet.add(r.commit_sha);
    if (r.pr_number != null) prSet.add(Number(r.pr_number));
  }
  return { commit_shas: [...shaSet], pr_numbers: [...prSet] };
}

async function loadPullRequests(
  sql: Sql,
  tenantId: string,
  commitShas: string[],
  prNumbers: number[],
): Promise<PullRequest[]> {
  const rows = (await sql.unsafe(
    `SELECT provider_repo_id, pr_number, head_sha, merge_commit_sha, state,
            (ingested_at IS NOT NULL) AS present,
            title_hash, author_login_hash,
            additions, deletions, changed_files,
            head_ref, base_ref
       FROM github_pull_requests
      WHERE tenant_id = $1
        AND (
          head_sha = ANY($2::text[])
          OR merge_commit_sha = ANY($2::text[])
          OR pr_number = ANY($3::int[])
        )`,
    [tenantId, commitShas, prNumbers],
  )) as unknown as Array<{
    provider_repo_id: string;
    pr_number: number;
    head_sha: string;
    merge_commit_sha: string | null;
    state: string;
    title_hash: Buffer;
    author_login_hash: Buffer;
    additions: number;
    deletions: number;
    changed_files: number;
    head_ref: string;
  }>;
  return rows.map((r) => ({
    provider_repo_id: r.provider_repo_id,
    pr_number: r.pr_number,
    head_sha: r.head_sha,
    merge_commit_sha: r.merge_commit_sha,
    state: r.state === "open" || r.state === "closed" || r.state === "merged" ? r.state : "open",
    from_fork: false,
    title_hash: r.title_hash,
    author_login_hash: r.author_login_hash,
    additions: r.additions,
    deletions: r.deletions,
    changed_files: r.changed_files,
  }));
}

async function loadDeployments(
  sql: Sql,
  tenantId: string,
  commitShas: string[],
): Promise<Deployment[]> {
  const rows = (await sql.unsafe(
    `SELECT provider_repo_id, deployment_id::text AS deployment_id,
            sha, environment, status
       FROM github_deployments
      WHERE tenant_id = $1
        AND sha = ANY($2::text[])`,
    [tenantId, commitShas],
  )) as unknown as Array<{
    provider_repo_id: string;
    deployment_id: string;
    sha: string;
    environment: string;
    status: string;
  }>;
  return rows.map((r) => ({
    provider_repo_id: r.provider_repo_id,
    deployment_id: r.deployment_id,
    sha: r.sha,
    environment: r.environment,
    status: r.status,
  }));
}

async function loadAliases(sql: Sql, tenantId: string): Promise<Alias[]> {
  const rows = (await sql.unsafe(
    `SELECT old_hash, new_hash, reason
       FROM repo_id_hash_aliases
      WHERE tenant_id = $1 AND archived_at IS NULL`,
    [tenantId],
  )) as unknown as Array<{ old_hash: Buffer; new_hash: Buffer; reason: string }>;
  return rows.map((r) => ({
    old_hash: r.old_hash,
    new_hash: r.new_hash,
    reason: normalizeAliasReason(r.reason),
  }));
}

function normalizeAliasReason(raw: string): Alias["reason"] {
  if (
    raw === "rename" ||
    raw === "transfer" ||
    raw === "salt_rotation" ||
    raw === "provider_change"
  ) {
    return raw;
  }
  return "rename";
}
