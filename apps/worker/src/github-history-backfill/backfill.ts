// 90-day retroactive PR + commit ingestion for GitHub installations.
//
// Fires after the initial repo sync (github-initial-sync) has populated the
// repo catalog. For each tracked repo on the installation, paginates:
//   GET /repos/{owner}/{repo}/pulls?state=all&sort=updated&direction=desc
//       &per_page=100
//   GET /repos/{owner}/{repo}/commits?per_page=100&since=<now-windowDays>
// For each item, synthesizes a webhook-shaped payload
// (`pull_request.opened` / `push`) and publishes it to the
// `github.webhooks` Kafka topic. The existing worker consumer
// (apps/worker/src/github/consumer.ts) is the single write path into
// Postgres — we never bypass it. One code path for auth/validation/RLS/
// UPSERT key choice.
//
// Rate-limit discipline mirrors apps/worker/src/github-initial-sync:
//   - Local semaphore (5-slot per worker node) gates concurrent
//     installations.
//   - Per-installation Redis token bucket (1 req/s floor, burst 10) gates
//     every outbound GitHub fetch.
//   - 429 → exponential backoff min(60s · 2^n, 900s) ± 20%, max 5 retries.
//   - 403 secondary-rate-limit → honor Retry-After, 30s floor + 30% jitter.
//   - X-RateLimit-Remaining < 100 → pause until reset + 5s jitter.
//
// Resumability: one progress row per (tenant, installation, provider_repo_id,
// kind). Each page persists `next_page_cursor` (next page number) + `fetched`
// + `pages_fetched` BEFORE any long rate-limit pause. A killed worker that
// restarts picks up the same row in status='running' and continues from the
// saved cursor.
//
// Idempotency: the consumer UPSERTs PRs on
// (tenant_id, provider_repo_id, pr_number), so re-running a repo's pulls
// backfill never creates duplicate rows. For push events the consumer appends
// to `git_events` (append-only log); the progress row guarantees the same
// page is never fetched twice in a successful run, so re-publication is
// bounded to partial-crash replays of the in-flight page. Outcome
// attribution downstream already tolerates multiple git_events rows with the
// same commit_sha.
//
// Scope (v1): /pulls and /commits only. /pulls/{n}/reviews and /pulls/{n}/files
// are follow-up work — they inflate the request budget 10× and v1 already
// populates Outcomes without them. Historical check_runs / workflow_runs is a
// separate backfill (same shape, different endpoint).

import type { Sql } from "postgres";
import type {
  WebhookBusMessage,
  WebhookBusProducer,
} from "../../../ingest/src/github-app/webhookBus";
import {
  encodePayload,
  GITHUB_WEBHOOKS_TOPIC,
  type WebhookBusPayload,
} from "../../../ingest/src/github-app/webhookBus";
import type { LocalSemaphore } from "../github-initial-sync/semaphore";
import type { TokenBucket } from "../github-initial-sync/tokenBucket";

// ---------------------------------------------------------------------------
// Types

export type HistoryKind = "pulls" | "commits";

export interface TrackedRepo {
  providerRepoId: string;
  fullName: string;
  defaultBranch: string;
}

export interface HistoryBackfillInput {
  sql: Sql;
  tenantId: string;
  installationId: bigint;
  getInstallationToken: (installationId: bigint) => Promise<string>;
  semaphore: LocalSemaphore;
  tokenBucket: TokenBucket;
  /**
   * Emits synthesized webhook payloads to Kafka. In production this is the
   * shared KafkaWebhookBus producer. Tests inject a recorder.
   */
  publish: WebhookBusProducer["publish"];
  /** Target topic. Defaults to GITHUB_WEBHOOKS_TOPIC. */
  topic?: string;
  /** Window length in days. Default 90 per v1 scope. */
  windowDays?: number;
  fetchFn?: typeof fetch;
  clock?: () => number;
  sleep?: (ms: number) => Promise<void>;
  apiBase?: string;
  perPage?: number;
  requestedBy?: string | null;
  onInstrumentation?: (evt: {
    stage:
      | "slot_requested"
      | "slot_acquired"
      | "slot_released"
      | "repo_started"
      | "repo_kind_completed"
      | "page_fetched"
      | "rate_limit_pause"
      | "retry";
    detail?: Record<string, unknown>;
  }) => void;
  /**
   * Override for tests: skip the `repos` table read and use this fixed list.
   * Production leaves this undefined so the worker pulls the tracked-repo
   * projection from Postgres.
   */
  loadTrackedRepos?: () => Promise<TrackedRepo[]>;
}

export interface HistoryBackfillReport {
  status: "completed" | "failed";
  tenantId: string;
  installationId: bigint;
  reposProcessed: number;
  prsPublished: number;
  commitsPublished: number;
  pagesFetched: number;
  pausedForRateLimitMs: number;
  retries: number;
  error?: string;
}

const DEFAULT_WINDOW_DAYS = 90;
const DEFAULT_PER_PAGE = 100;

// ---------------------------------------------------------------------------
// Public: enqueue rows for a given installation.

/**
 * Seed one `queued` row per (repo, kind) for the installation. Called by the
 * admin "Backfill last 90 days" action AND by the auto-dispatcher that runs
 * after the initial sync completes. Idempotent — ON CONFLICT resets the row
 * to `queued` and clears the cursor so a re-enqueue forces a fresh walk.
 */
export async function enqueueHistoryBackfill(args: {
  sql: Sql;
  tenantId: string;
  installationId: bigint;
  windowDays?: number;
  requestedBy?: string | null;
  now?: () => number;
  loadTrackedRepos?: () => Promise<TrackedRepo[]>;
}): Promise<{ reposQueued: number; rowsQueued: number; sinceTs: string }> {
  const now = args.now ?? Date.now;
  const windowDays = args.windowDays ?? DEFAULT_WINDOW_DAYS;
  const sinceTs = new Date(now() - windowDays * 86_400_000).toISOString();

  const repos = args.loadTrackedRepos
    ? await args.loadTrackedRepos()
    : await listTrackedRepos(args.sql, args.tenantId);

  let rowsQueued = 0;
  for (const repo of repos) {
    for (const kind of ["pulls", "commits"] as const) {
      await args.sql.unsafe(
        `INSERT INTO github_history_sync_progress
           (tenant_id, installation_id, provider_repo_id, kind, status,
            since_ts, requested_by, last_progress_at, updated_at)
         VALUES ($1, $2, $3, $4, 'queued', $5, $6, now(), now())
         ON CONFLICT (tenant_id, installation_id, provider_repo_id, kind)
           DO UPDATE SET
             status            = 'queued',
             since_ts          = EXCLUDED.since_ts,
             next_page_cursor  = NULL,
             fetched           = 0,
             pages_fetched     = 0,
             started_at        = NULL,
             completed_at      = NULL,
             last_error        = NULL,
             last_progress_at  = now(),
             updated_at        = now(),
             requested_by      = COALESCE(EXCLUDED.requested_by, github_history_sync_progress.requested_by)`,
        [
          args.tenantId,
          args.installationId.toString(),
          repo.providerRepoId,
          kind,
          sinceTs,
          args.requestedBy ?? null,
        ],
      );
      rowsQueued += 1;
    }
  }

  return { reposQueued: repos.length, rowsQueued, sinceTs };
}

// ---------------------------------------------------------------------------
// Public: run the backfill for a single installation.

export async function runHistoryBackfill(
  input: HistoryBackfillInput,
): Promise<HistoryBackfillReport> {
  const clock = input.clock ?? Date.now;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const fetchFn = input.fetchFn ?? fetch;
  const apiBase = input.apiBase ?? "https://api.github.com";
  const perPage = input.perPage ?? DEFAULT_PER_PAGE;
  const topic = input.topic ?? GITHUB_WEBHOOKS_TOPIC;
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const instrument = input.onInstrumentation ?? (() => {});

  instrument({ stage: "slot_requested" });
  const release = await input.semaphore.acquire();
  instrument({ stage: "slot_acquired" });

  let reposProcessed = 0;
  let prsPublished = 0;
  let commitsPublished = 0;
  let pagesFetched = 0;
  let pausedMs = 0;
  let retries = 0;

  try {
    const token = await input.getInstallationToken(input.installationId);
    const bucketKey = `rl:hist:${input.installationId.toString()}`;

    // Build the tracked-repo list — prefer the injected override (tests),
    // otherwise read from Postgres.
    const repos = input.loadTrackedRepos
      ? await input.loadTrackedRepos()
      : await listTrackedRepos(input.sql, input.tenantId);
    const repoByProviderId = new Map(repos.map((r) => [r.providerRepoId, r]));

    // Pick queued / running rows in deterministic order so resumability is
    // stable across restarts.
    const rows = (await input.sql.unsafe(
      `SELECT provider_repo_id, kind, since_ts, next_page_cursor,
              fetched, pages_fetched
         FROM github_history_sync_progress
        WHERE tenant_id = $1 AND installation_id = $2
          AND status IN ('queued','running')
        ORDER BY provider_repo_id, kind`,
      [input.tenantId, input.installationId.toString()],
    )) as unknown as Array<{
      provider_repo_id: string;
      kind: HistoryKind;
      since_ts: string | Date;
      next_page_cursor: string | null;
      fetched: number;
      pages_fetched: number;
    }>;

    for (const row of rows) {
      const repo = repoByProviderId.get(row.provider_repo_id);
      if (!repo) {
        // Repo is no longer tracked (deleted / excluded after enqueue) —
        // mark the row cancelled so the dispatcher doesn't keep picking it.
        await input.sql.unsafe(
          `UPDATE github_history_sync_progress
             SET status = 'cancelled',
                 last_progress_at = now(),
                 updated_at = now(),
                 last_error = 'repo no longer tracked'
           WHERE tenant_id = $1 AND installation_id = $2
             AND provider_repo_id = $3 AND kind = $4`,
          [input.tenantId, input.installationId.toString(), row.provider_repo_id, row.kind],
        );
        continue;
      }

      instrument({
        stage: "repo_started",
        detail: { provider_repo_id: row.provider_repo_id, kind: row.kind },
      });

      const sinceIso =
        row.since_ts instanceof Date ? row.since_ts.toISOString() : String(row.since_ts);

      // Flip to running.
      await input.sql.unsafe(
        `UPDATE github_history_sync_progress
           SET status = 'running',
               started_at = COALESCE(started_at, now()),
               last_progress_at = now(),
               updated_at = now(),
               last_error = NULL
         WHERE tenant_id = $1 AND installation_id = $2
           AND provider_repo_id = $3 AND kind = $4`,
        [input.tenantId, input.installationId.toString(), row.provider_repo_id, row.kind],
      );

      const state = {
        page: parseCursor(row.next_page_cursor) ?? 1,
        fetched: row.fetched ?? 0,
        pagesFetched: row.pages_fetched ?? 0,
      };

      try {
        const outcome = await backfillRepoKind({
          sql: input.sql,
          tenantId: input.tenantId,
          installationId: input.installationId,
          repo,
          kind: row.kind,
          sinceIso,
          token,
          bucketKey,
          state,
          clock,
          sleep,
          fetchFn,
          apiBase,
          perPage,
          topic,
          publish: input.publish,
          tokenBucket: input.tokenBucket,
          instrument,
        });
        pagesFetched += outcome.pagesThisRepo;
        pausedMs += outcome.pausedMs;
        retries += outcome.retries;
        if (row.kind === "pulls") prsPublished += outcome.itemsPublished;
        else commitsPublished += outcome.itemsPublished;

        await input.sql.unsafe(
          `UPDATE github_history_sync_progress
             SET status = 'completed',
                 completed_at = now(),
                 next_page_cursor = NULL,
                 last_progress_at = now(),
                 updated_at = now()
           WHERE tenant_id = $1 AND installation_id = $2
             AND provider_repo_id = $3 AND kind = $4`,
          [input.tenantId, input.installationId.toString(), row.provider_repo_id, row.kind],
        );
        instrument({
          stage: "repo_kind_completed",
          detail: {
            provider_repo_id: row.provider_repo_id,
            kind: row.kind,
            items: outcome.itemsPublished,
          },
        });
        reposProcessed += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await input.sql.unsafe(
          `UPDATE github_history_sync_progress
             SET status = 'failed',
                 last_error = $1,
                 last_progress_at = now(),
                 updated_at = now()
           WHERE tenant_id = $2 AND installation_id = $3
             AND provider_repo_id = $4 AND kind = $5`,
          [
            msg.slice(0, 4096),
            input.tenantId,
            input.installationId.toString(),
            row.provider_repo_id,
            row.kind,
          ],
        );
        // Fail-fast: one bad repo shouldn't sink the whole installation's
        // backfill. Continue with the next row.
      }
    }

    void windowDays; // referenced in enqueue; kept here for future tuning.

    return {
      status: "completed",
      tenantId: input.tenantId,
      installationId: input.installationId,
      reposProcessed,
      prsPublished,
      commitsPublished,
      pagesFetched,
      pausedForRateLimitMs: pausedMs,
      retries,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "failed",
      tenantId: input.tenantId,
      installationId: input.installationId,
      reposProcessed,
      prsPublished,
      commitsPublished,
      pagesFetched,
      pausedForRateLimitMs: pausedMs,
      retries,
      error: message,
    };
  } finally {
    instrument({ stage: "slot_released" });
    release();
  }
}

// ---------------------------------------------------------------------------
// Per-(repo, kind) pagination.

interface RepoKindOutcome {
  itemsPublished: number;
  pagesThisRepo: number;
  pausedMs: number;
  retries: number;
}

interface RepoKindCtx {
  sql: Sql;
  tenantId: string;
  installationId: bigint;
  repo: TrackedRepo;
  kind: HistoryKind;
  sinceIso: string;
  token: string;
  bucketKey: string;
  state: { page: number; fetched: number; pagesFetched: number };
  clock: () => number;
  sleep: (ms: number) => Promise<void>;
  fetchFn: typeof fetch;
  apiBase: string;
  perPage: number;
  topic: string;
  publish: WebhookBusProducer["publish"];
  tokenBucket: TokenBucket;
  instrument: NonNullable<HistoryBackfillInput["onInstrumentation"]>;
}

async function backfillRepoKind(ctx: RepoKindCtx): Promise<RepoKindOutcome> {
  const sinceMs = Date.parse(ctx.sinceIso);
  let itemsPublished = 0;
  let pagesThisRepo = 0;
  let pausedMs = 0;
  let retries = 0;

  for (;;) {
    {
      const { waitMs } = await ctx.tokenBucket.acquire(ctx.bucketKey);
      if (waitMs > 0) await ctx.sleep(waitMs);
    }

    const url = buildUrl(ctx);
    let res: Response;
    let attempt = 0;
    for (;;) {
      res = await ctx.fetchFn(url, {
        headers: {
          authorization: `Bearer ${ctx.token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          "user-agent": "bematist-history-backfill/1.0",
        },
      });

      if (res.status === 200) break;

      if (res.status === 429) {
        if (attempt >= 5) {
          throw new Error(
            `history-backfill: 429 after 5 retries for ${ctx.repo.fullName} kind=${ctx.kind}`,
          );
        }
        const retryAfter = Number(res.headers.get("retry-after") ?? "0");
        const exp = Math.min(60_000 * 2 ** attempt, 900_000);
        const jitter = exp * (0.8 + Math.random() * 0.4);
        const waitMs = Math.max(retryAfter * 1000, jitter);
        ctx.instrument({ stage: "retry", detail: { attempt, waitMs, reason: "429" } });
        await ctx.sleep(waitMs);
        pausedMs += waitMs;
        retries += 1;
        attempt += 1;
        continue;
      }

      if (res.status === 403) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "30");
        const jitter = retryAfter * 1000 * (1 + Math.random() * 0.3);
        const waitMs = Math.max(30_000, jitter);
        ctx.instrument({ stage: "retry", detail: { attempt, waitMs, reason: "403" } });
        await ctx.sleep(waitMs);
        pausedMs += waitMs;
        retries += 1;
        attempt += 1;
        if (attempt >= 5) {
          throw new Error(
            `history-backfill: 403 after 5 retries for ${ctx.repo.fullName} kind=${ctx.kind}`,
          );
        }
        continue;
      }

      if (res.status === 404) {
        // Repo might have been deleted/archived/transferred between initial
        // sync and backfill. Treat as empty: no items to publish.
        return { itemsPublished, pagesThisRepo, pausedMs, retries };
      }

      throw new Error(
        `history-backfill: unexpected status ${res.status} for ${ctx.repo.fullName} kind=${ctx.kind} page=${ctx.state.page}`,
      );
    }

    const items = (await res.json()) as unknown[];
    if (!Array.isArray(items)) {
      throw new Error(
        `history-backfill: non-array response for ${ctx.repo.fullName} kind=${ctx.kind}`,
      );
    }

    let publishedThisPage = 0;
    let reachedCutoff = false;

    for (const raw of items) {
      if (ctx.kind === "pulls") {
        const pr = raw as Record<string, unknown>;
        // Sorted by updated desc — once we cross the cutoff we can stop
        // paginating entirely (no older-than-cutoff PR will have a newer
        // updated_at than one we already saw).
        const updatedAt = typeof pr.updated_at === "string" ? Date.parse(pr.updated_at) : NaN;
        if (Number.isFinite(updatedAt) && updatedAt < sinceMs) {
          reachedCutoff = true;
          break;
        }
        const msg = synthesizePrWebhook({
          pr,
          repo: ctx.repo,
          installationId: ctx.installationId,
          tenantId: ctx.tenantId,
          receivedAt: new Date(ctx.clock()).toISOString(),
        });
        await ctx.publish(ctx.topic, msg);
        publishedThisPage += 1;
      } else {
        const commit = raw as Record<string, unknown>;
        const msg = synthesizePushWebhook({
          commit,
          repo: ctx.repo,
          installationId: ctx.installationId,
          tenantId: ctx.tenantId,
          receivedAt: new Date(ctx.clock()).toISOString(),
        });
        await ctx.publish(ctx.topic, msg);
        publishedThisPage += 1;
      }
    }

    itemsPublished += publishedThisPage;
    pagesThisRepo += 1;
    ctx.state.fetched += publishedThisPage;
    ctx.state.pagesFetched += 1;

    const remaining = Number(res.headers.get("x-ratelimit-remaining") ?? Number.POSITIVE_INFINITY);
    const resetEpochSec = Number(res.headers.get("x-ratelimit-reset") ?? 0);
    const hasNext = !reachedCutoff && /rel="next"/.test(res.headers.get("link") ?? "");

    ctx.instrument({
      stage: "page_fetched",
      detail: {
        provider_repo_id: ctx.repo.providerRepoId,
        kind: ctx.kind,
        page: ctx.state.page,
        items: items.length,
        published: publishedThisPage,
        reachedCutoff,
        remaining,
      },
    });

    // Persist progress BEFORE any long pause.
    await ctx.sql.unsafe(
      `UPDATE github_history_sync_progress
         SET fetched = $1,
             pages_fetched = $2,
             next_page_cursor = $3,
             last_progress_at = now(),
             updated_at = now()
       WHERE tenant_id = $4 AND installation_id = $5
         AND provider_repo_id = $6 AND kind = $7`,
      [
        ctx.state.fetched,
        ctx.state.pagesFetched,
        hasNext ? String(ctx.state.page + 1) : null,
        ctx.tenantId,
        ctx.installationId.toString(),
        ctx.repo.providerRepoId,
        ctx.kind,
      ],
    );

    if (!hasNext) break;

    if (remaining < 100 && resetEpochSec > 0) {
      const nowSec = Math.floor(ctx.clock() / 1000);
      const jitterSec = 5 + Math.random() * 5;
      const waitMs = Math.max(0, (resetEpochSec + jitterSec - nowSec) * 1000);
      if (waitMs > 0) {
        ctx.instrument({
          stage: "rate_limit_pause",
          detail: { waitMs, remaining, resetEpochSec, kind: ctx.kind },
        });
        await ctx.sleep(waitMs);
        pausedMs += waitMs;
      }
    }

    ctx.state.page += 1;
  }

  return { itemsPublished, pagesThisRepo, pausedMs, retries };
}

function buildUrl(ctx: RepoKindCtx): string {
  const [owner, name] = splitFullName(ctx.repo.fullName);
  const base = `${ctx.apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  if (ctx.kind === "pulls") {
    // `since` is NOT a documented filter on /pulls — GitHub ignores unknown
    // params, but we keep it on the wire as a future-proofing hint. The
    // authoritative cutoff happens client-side via the sorted-desc break.
    return `${base}/pulls?state=all&sort=updated&direction=desc&per_page=${ctx.perPage}&page=${ctx.state.page}&since=${encodeURIComponent(ctx.sinceIso)}`;
  }
  return `${base}/commits?per_page=${ctx.perPage}&page=${ctx.state.page}&since=${encodeURIComponent(ctx.sinceIso)}`;
}

function splitFullName(full: string): [string, string] {
  const idx = full.indexOf("/");
  if (idx <= 0) return [full, full];
  return [full.slice(0, idx), full.slice(idx + 1)];
}

function parseCursor(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

// ---------------------------------------------------------------------------
// Webhook synthesis.

function synthesizePrWebhook(args: {
  pr: Record<string, unknown>;
  repo: TrackedRepo;
  installationId: bigint;
  tenantId: string;
  receivedAt: string;
}): WebhookBusMessage {
  const pr = args.pr;
  // The consumer's domain parser derives state from merged_at/closed_at
  // regardless of the action string, so `opened` is a safe synthetic action
  // — it passes the SUPPORTED set gate and makes it obvious in logs that
  // this came from a backfill. The parser also requires: repository.id,
  // pull_request.number, pull_request.node_id.
  const body = {
    action: "opened",
    pull_request: pr,
    repository: {
      id: Number(args.repo.providerRepoId),
      full_name: args.repo.fullName,
      default_branch: args.repo.defaultBranch,
    },
    installation: { id: Number(args.installationId) },
  };
  const bodyJson = JSON.stringify(body);
  const bodyB64 = Buffer.from(bodyJson, "utf8").toString("base64");
  const payload: WebhookBusPayload = {
    delivery_id: `backfill-pr-${args.repo.providerRepoId}-${String(pr.number ?? "")}-${args.receivedAt}`,
    event: "pull_request",
    tenant_id: args.tenantId,
    installation_id: args.installationId.toString(),
    body_b64: bodyB64,
    received_at: args.receivedAt,
  };
  return {
    key: `${args.tenantId}:${args.installationId.toString()}`,
    value: encodePayload(payload),
    headers: {
      "x-github-event": "pull_request",
      "x-github-delivery": payload.delivery_id,
      "x-bematist-source": "history-backfill",
    },
  };
}

function synthesizePushWebhook(args: {
  commit: Record<string, unknown>;
  repo: TrackedRepo;
  installationId: bigint;
  tenantId: string;
  receivedAt: string;
}): WebhookBusMessage {
  const sha = typeof args.commit.sha === "string" ? args.commit.sha : "";
  // The consumer's push parser reads only: repository.id, ref, after, forced.
  // We synthesize a minimal push per commit — one commit = one `push` event.
  // Branch is best-effort (default_branch) since /commits doesn't return
  // branch info. Downstream attribution only requires commit_sha to match.
  const body = {
    ref: `refs/heads/${args.repo.defaultBranch}`,
    before: "0000000000000000000000000000000000000000",
    after: sha,
    forced: false,
    repository: {
      id: Number(args.repo.providerRepoId),
      full_name: args.repo.fullName,
      default_branch: args.repo.defaultBranch,
    },
    installation: { id: Number(args.installationId) },
    commits: [args.commit],
    head_commit: args.commit,
  };
  const bodyJson = JSON.stringify(body);
  const bodyB64 = Buffer.from(bodyJson, "utf8").toString("base64");
  const payload: WebhookBusPayload = {
    delivery_id: `backfill-commit-${args.repo.providerRepoId}-${sha}`,
    event: "push",
    tenant_id: args.tenantId,
    installation_id: args.installationId.toString(),
    body_b64: bodyB64,
    received_at: args.receivedAt,
  };
  return {
    key: `${args.tenantId}:${args.installationId.toString()}`,
    value: encodePayload(payload),
    headers: {
      "x-github-event": "push",
      "x-github-delivery": payload.delivery_id,
      "x-bematist-source": "history-backfill",
    },
  };
}

// ---------------------------------------------------------------------------
// Tracked-repo projection.

export async function listTrackedRepos(sql: Sql, tenantId: string): Promise<TrackedRepo[]> {
  const rows = (await sql.unsafe(
    `SELECT r.provider_repo_id, r.full_name, r.default_branch, r.tracking_state,
            o.github_repo_tracking_mode AS mode
       FROM repos r
       JOIN orgs o ON o.id = r.org_id
      WHERE r.org_id = $1
        AND r.provider = 'github'
        AND r.provider_repo_id IS NOT NULL
        AND r.deleted_at IS NULL
        AND r.archived_at IS NULL`,
    [tenantId],
  )) as unknown as Array<{
    provider_repo_id: string | null;
    full_name: string | null;
    default_branch: string | null;
    tracking_state: string;
    mode: string;
  }>;

  const out: TrackedRepo[] = [];
  for (const r of rows) {
    if (!r.provider_repo_id || !r.full_name) continue;
    const tracked =
      r.mode === "selected" ? r.tracking_state === "included" : r.tracking_state !== "excluded";
    if (!tracked) continue;
    out.push({
      providerRepoId: r.provider_repo_id,
      fullName: r.full_name,
      defaultBranch: r.default_branch ?? "main",
    });
  }
  return out;
}
