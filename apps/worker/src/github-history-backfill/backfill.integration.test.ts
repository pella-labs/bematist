// Integration test — history-backfill end-to-end over a real broker + real
// Postgres. Same shape as apps/worker/src/github/kafkaE2E.test.ts: the
// backfill worker produces synthesized webhooks via the real KafkaWebhookBus,
// the consumer drains them and writes to Postgres. We then assert a
// `github_pull_requests` row lands for the synthesized PR.
//
// Opt-in: requires E2E_KAFKA=1 + DATABASE_URL pointing at a dev Postgres
// (the docker-compose.dev.yml one). Skipped by default.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Kafka } from "kafkajs";
import postgres from "postgres";
import { createKafkaWebhookBus } from "../../../ingest/src/github-app/kafkaWebhookBus";
import {
  createInMemoryRecomputeStream,
  type InMemoryRecomputeStream,
} from "../../../ingest/src/github-app/recomputeStream";
import { GITHUB_WEBHOOKS_TOPIC } from "../../../ingest/src/github-app/webhookBus";
import { startKafkaGithubConsumer } from "../github/kafkaConsumer";
import { createLocalSemaphore } from "../github-initial-sync/semaphore";
import { createTokenBucket } from "../github-initial-sync/tokenBucket";
import { enqueueHistoryBackfill, runHistoryBackfill } from "./backfill";
import { createMockGitHubApi, makePulls } from "./ghApiMock";

const ENABLED = process.env.E2E_KAFKA === "1" && process.env.DATABASE_URL !== undefined;
const BROKERS = (process.env.KAFKA_BROKERS ?? "localhost:9092")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const PG_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/bematist";

const TOPIC = `${GITHUB_WEBHOOKS_TOPIC}.history-e2e-${Date.now()}`;

let client: ReturnType<typeof postgres> | null = null;

beforeAll(async () => {
  if (!ENABLED) return;
  client = postgres(PG_URL, { max: 4, idle_timeout: 5, connect_timeout: 5 });
});

afterAll(async () => {
  if (client) await client.end();
});

describe.skipIf(!ENABLED)("history-backfill E2E — worker → redpanda → consumer → postgres", () => {
  test("synthesized PR payload round-trips into github_pull_requests", async () => {
    if (!client) throw new Error("pg not live");

    // ---- Setup tenant + repo + installation + completed initial sync ----
    const slug = `gh_hist_e2e_${Date.now()}`;
    const orgRows = (await client.unsafe(
      `INSERT INTO orgs (slug, name) VALUES ($1, $2) RETURNING id`,
      [slug, slug],
    )) as unknown as Array<{ id: string }>;
    const orgId = orgRows[0]!.id;
    const installationId = BigInt(Math.floor(Math.random() * 2_000_000_000) + 100_000);
    await client.unsafe(
      `INSERT INTO github_installations
           (tenant_id, installation_id, github_org_id, github_org_login, app_id,
            status, token_ref, webhook_secret_active_ref)
         VALUES ($1, $2, 999, 'test-e2e', 1234, 'active', 'kms://t', 'kms://s')`,
      [orgId, installationId.toString()],
    );
    const providerRepoId = "70001";
    await client.unsafe(
      `INSERT INTO repos
           (id, org_id, repo_id_hash, provider, provider_repo_id, full_name,
            default_branch, first_seen_at, tracking_state)
         VALUES (gen_random_uuid(), $1, $2::bytea, 'github', $3, 'test-e2e/repo',
                 'main', now(), 'inherit')`,
      [orgId, `\\x${Buffer.from(`gh:${providerRepoId}:${orgId}`).toString("hex")}`, providerRepoId],
    );

    // ---- Build Kafka producer + ensure topic ------------------------
    const bus = createKafkaWebhookBus({ brokers: BROKERS, clientId: "hist-backfill-e2e" });
    await bus.ensureTopic(TOPIC, 4);

    // ---- Start worker consumer against this topic -------------------
    const recompute: InMemoryRecomputeStream = createInMemoryRecomputeStream();
    const consumerHandle = await startKafkaGithubConsumer(
      {
        brokers: BROKERS,
        topic: TOPIC,
        clientId: "hist-backfill-e2e-consumer",
        groupId: `hist-backfill-group-${Date.now()}`,
        fromBeginning: true,
      },
      {
        sql: client,
        recompute,
        log: () => {},
      },
    );

    // ---- Run the backfill worker with a mock GitHub that returns 1 PR
    const mock = createMockGitHubApi({
      perPage: 100,
      repos: [
        {
          owner: "test-e2e",
          name: "repo",
          pulls: makePulls(1, Number(providerRepoId)),
          commits: [],
        },
      ],
    });

    await enqueueHistoryBackfill({
      sql: client,
      tenantId: orgId,
      installationId,
      windowDays: 90,
    });

    const report = await runHistoryBackfill({
      sql: client,
      tenantId: orgId,
      installationId,
      getInstallationToken: async () => "ghs_fake",
      semaphore: createLocalSemaphore(5),
      tokenBucket: createTokenBucket({
        store: {
          async get() {
            return null;
          },
          async set() {},
        },
        refillPerSecond: 1_000,
        burst: 1_000,
      }),
      publish: (topic, msg) => bus.publish(topic, msg),
      topic: TOPIC,
      fetchFn: mock.fetch,
      perPage: 100,
    });
    expect(report.status).toBe("completed");
    expect(report.prsPublished).toBe(1);

    await bus.close();

    // ---- Poll Postgres for the upsert -------------------------------
    const deadline = Date.now() + 30_000;
    let found = false;
    while (Date.now() < deadline) {
      const rows = (await client.unsafe(
        `SELECT pr_number FROM github_pull_requests
            WHERE tenant_id=$1 AND provider_repo_id=$2`,
        [orgId, providerRepoId],
      )) as unknown as Array<{ pr_number: number }>;
      if (rows.length > 0) {
        found = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    await consumerHandle.stop();
    expect(found).toBe(true);

    // ---- Cleanup topic + tenant rows --------------------------------
    try {
      const kafka = new Kafka({ clientId: "hist-backfill-cleanup", brokers: BROKERS });
      const admin = kafka.admin();
      await admin.connect();
      await admin.deleteTopics({ topics: [TOPIC] });
      await admin.disconnect();
    } catch {
      // best-effort
    }
    await client.unsafe(`DELETE FROM github_pull_requests WHERE tenant_id=$1`, [orgId]);
    await client.unsafe(`DELETE FROM github_history_sync_progress WHERE tenant_id=$1`, [orgId]);
    await client.unsafe(`DELETE FROM github_sync_progress WHERE tenant_id=$1`, [orgId]);
    await client.unsafe(`DELETE FROM repos WHERE org_id=$1`, [orgId]);
    await client.unsafe(`DELETE FROM github_installations WHERE tenant_id=$1`, [orgId]);
    await client.unsafe(`DELETE FROM orgs WHERE id=$1`, [orgId]);
  }, 60_000);
});
