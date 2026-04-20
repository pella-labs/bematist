// Module-level dependency injection seam for the ingest server.
// Sprint 1 Phase 2 defaults: empty key store (safe-fail), permissive rate
// limiter, empty in-memory OrgPolicyStore (every org → 500 ORG_POLICY_MISSING
// until seeded), and noopRedactStage for tests (the real defaultRedactionStage
// from @bematist/redact is wired below).
// Phase 4 adds `wal` (Redis Streams appender) and `clickhouseWriter` (lazy
// CH client). Both default to in-memory test doubles so unit tests don't
// need network.
// M3 follow-up #2: `redactAuditSink` wires the redaction_audit side-table
// writer (contract 08 §Invariant #4 / contract 09 §Side tables). Default is
// `noopAuditSink`; boot in index.ts swaps for a ClickHouse-backed sink.
// Tests call setDeps({ ... }) in beforeAll to stub.

import { defaultRedactionStage, type RedactStage } from "@bematist/redact";
import { permissiveRateLimiter, type RateLimiter } from "./auth/rateLimit";
import type { IngestKeyStore } from "./auth/verifyIngestKey";
import { LRUCache } from "./auth/verifyIngestKey";
import { type ClickHouseWriter, createInMemoryClickHouseWriter } from "./clickhouse";
import { type DedupStore, InMemoryDedupStore } from "./dedup/checkDedup";
import { type Flags, parseFlags } from "./flags";
import {
  createInMemoryInstallationResolver,
  type InstallationResolver,
} from "./github-app/installationResolver";
import {
  createInMemoryWebhookSecretResolver,
  type WebhookSecretResolver,
} from "./github-app/secretsResolver";
import { createInMemoryWebhookBus, type WebhookBusProducer } from "./github-app/webhookBus";
import type { AuditLogSink } from "./github-app/webhookRoute";
import { logger } from "./logger";
import { createPolicyFlipDbHandle } from "./policy-flip/dbClient";
import type { PolicyFlipDeps } from "./policy-flip/handler";
import { noopAuditSink } from "./redact/auditSink";
import type { RedactionAuditSink } from "./redact/hotpath";
import { InMemoryOrgPolicyStore, type OrgPolicyStore } from "./tier/enforceTier";
import { createInMemoryWalAppender, type WalAppender } from "./wal/append";
import { createDrizzleOutcomesStore } from "./webhooks/drizzleOutcomesStore";
import { createInMemoryGitEventsStore, type GitEventsStore } from "./webhooks/gitEventsStore";
import { createInMemoryOutcomesStore, type OutcomesStore } from "./webhooks/outcomesStore";

/** Resolves an org slug from a webhook URL query param → internal org id. */
export interface OrgResolver {
  bySlug(slug: string): Promise<string | null>;
}

function createInMemoryOrgResolver(): OrgResolver & { seed(slug: string, id: string): void } {
  const m = new Map<string, string>();
  return {
    async bySlug(slug) {
      return m.get(slug) ?? null;
    },
    seed(slug, id) {
      m.set(slug, id);
    },
  };
}

export interface Deps {
  store: IngestKeyStore;
  rateLimiter: RateLimiter;
  cache: LRUCache;
  clock: () => number;
  orgPolicyStore: OrgPolicyStore;
  redactStage: RedactStage;
  redactAuditSink: RedactionAuditSink;
  dedupStore: DedupStore;
  wal: WalAppender;
  clickhouseWriter: ClickHouseWriter;
  flags: Flags;
  /**
   * Optional lag accessor wired by the WAL consumer at boot. Surfaced on
   * `/readyz.checks.wal_consumer_lag`. Null → consumer not wired.
   */
  walConsumerLag: (() => Promise<number>) | null;
  /** Transport dedup for webhooks (Phase 6). Separate from per-event dedupStore. */
  webhookDedup: DedupStore;
  /** Git events store (Phase 6) — backs /v1/webhooks/{github,gitlab,bitbucket}. */
  gitEventsStore: GitEventsStore;
  /**
   * Outcomes store (D29, CLAUDE.md §Outcome Attribution Layer 2). Receives
   * `AI-Assisted: bematist-<sessionId>` trailer-derived outcome rows parsed
   * out of push / pull_request webhooks + reconcile GraphQL responses.
   * Separate from `gitEventsStore` because outcomes are keyed on
   * (org, commit_sha, session_id) rather than on `pr_node_id`.
   */
  outcomesStore: OutcomesStore;
  /** Resolves ?org=<slug> on webhook paths to an internal org id. */
  orgResolver: OrgResolver;
  /**
   * Tier-C admin-flip deps (D20). Null until boot wires the Drizzle-backed
   * store/audit/alert impls; the HTTP route refuses with 500 when null so a
   * misconfigured deploy surfaces loudly instead of silently no-oping the
   * audit trail.
   */
  policyFlip: PolicyFlipDeps | null;
  /** G1: github_installations → tenant/webhook-secret lookup (PRD §7.1). */
  installationResolver: InstallationResolver;
  /** G1: webhook_secret_*_ref → Buffer lookup (PRD §11.5). */
  webhookSecretsResolver: WebhookSecretResolver;
  /** G1: Redpanda producer for `github.webhooks` (PRD §7.1). */
  githubWebhookBus: WebhookBusProducer;
  /** G1: audit log sink — receives BAD_SIGNATURE rejections + policy writes. */
  githubAuditSink: AuditLogSink;
}

function makeDefaultDeps(): Deps {
  const emptyStore: IngestKeyStore = {
    async get() {
      return null;
    },
  };
  return {
    store: emptyStore,
    rateLimiter: permissiveRateLimiter(),
    cache: new LRUCache({ max: 1000, ttlMs: 60_000 }),
    clock: () => Date.now(),
    // Empty policy store — get() returns null for every org until seeded.
    // Tests seed via setDeps({ orgPolicyStore: store }).
    orgPolicyStore: new InMemoryOrgPolicyStore(),
    // Real TruffleHog + Gitleaks + Presidio pipeline per contract 08. Tests
    // that want to bypass server-side redaction inject `noopRedactStage`.
    redactStage: defaultRedactionStage,
    redactAuditSink: noopAuditSink,
    // InMemoryDedupStore satisfies /readyz preflight (returns "noeviction")
    // and is swapped for a real Redis-backed impl at boot on managed stacks.
    dedupStore: new InMemoryDedupStore(),
    wal: createInMemoryWalAppender(),
    clickhouseWriter: createInMemoryClickHouseWriter(),
    flags: parseFlags(process.env as Record<string, string | undefined>),
    walConsumerLag: null,
    webhookDedup: new InMemoryDedupStore(),
    gitEventsStore: createInMemoryGitEventsStore(),
    // OutcomesStore: InMemory is the safe default for tests + dev where
    // DATABASE_URL is absent. Prod + self-host deploys land trailer rows in
    // the real `outcomes` table via the Drizzle-backed store. The env switch
    // below mirrors the pattern used for other pg-backed stores (wired from
    // index.ts) but is applied directly here so the Drizzle store picks up
    // as soon as DATABASE_URL is set — no second setDeps() hop required.
    outcomesStore: resolveOutcomesStore(),
    orgResolver: createInMemoryOrgResolver(),
    policyFlip: null,
    installationResolver: createInMemoryInstallationResolver(),
    webhookSecretsResolver: createInMemoryWebhookSecretResolver(),
    githubWebhookBus: createInMemoryWebhookBus(),
    // Default audit sink is a no-op — tests swap for in-memory recorder; boot
    // swaps for a Drizzle `audit_log` writer.
    githubAuditSink: async () => {
      /* no-op */
    },
  };
}

/**
 * Resolves the default OutcomesStore at module-load time.
 *
 *   - BEMATIST_OUTCOMES_STORE=memory           → always InMemory
 *   - BEMATIST_OUTCOMES_STORE=drizzle          → force Drizzle (throws if no
 *                                                DATABASE_URL)
 *   - (unset) + NODE_ENV=test                  → InMemory (no network in
 *                                                bun test)
 *   - (unset) + DATABASE_URL present           → Drizzle
 *   - (unset) + DATABASE_URL absent            → InMemory (graceful on solo
 *                                                mode boots without PG)
 *
 * Any Drizzle-construction failure falls back to InMemory with a loud
 * warning so a misconfigured solo boot doesn't crash before the HTTP
 * server comes up. The webhook path then logs `outcome trailer recorded`
 * against the in-memory store — honest state, nothing lost, but operators
 * see the warning on boot.
 */
function resolveOutcomesStore(): OutcomesStore {
  const override = (process.env.BEMATIST_OUTCOMES_STORE ?? "").toLowerCase();
  if (override === "memory") return createInMemoryOutcomesStore();
  const hasDbUrl =
    typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.length > 0;
  const isTest = process.env.NODE_ENV === "test";
  const wantDrizzle = override === "drizzle" || (!isTest && hasDbUrl);
  if (!wantDrizzle) return createInMemoryOutcomesStore();
  try {
    const handle = createPolicyFlipDbHandle();
    logger.info(
      { override: override || "auto" },
      "outcomesStore wired (drizzle-backed, postgres-js pool max=3)",
    );
    return createDrizzleOutcomesStore(handle.db);
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        fallback: "memory",
      },
      "drizzle outcomesStore wiring failed — falling back to in-memory",
    );
    return createInMemoryOutcomesStore();
  }
}

export { createInMemoryOrgResolver };

// Intentionally mutable: swapped by setDeps() in tests and boot wiring.
let _deps: Deps = makeDefaultDeps();

export function getDeps(): Deps {
  return _deps;
}

export function setDeps(patch: Partial<Deps>): void {
  _deps = { ..._deps, ...patch };
}

export function resetDeps(): void {
  _deps = makeDefaultDeps();
}
