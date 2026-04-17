// Bematist — PgBoss worker entrypoint.
// PgBoss is for crons only (CLAUDE.md Architecture Rule #4). Per-event work goes
// to ClickHouse MVs or Redis Streams.

import PgBoss from "pg-boss";
import { ch } from "./clickhouse";
import { db } from "./db";
import { handlePartitionDrop } from "./jobs/partition_drop";

const PG_BOSS_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/bematist";
const GDPR_CRON_SCHEDULE = process.env.GDPR_CRON_SCHEDULE ?? "0 * * * *"; // hourly

export async function startWorker() {
  const boss = new PgBoss(PG_BOSS_URL);
  await boss.start();

  await boss.work("gdpr.partition_drop", async () => {
    const processed = await handlePartitionDrop({ db, ch: ch() });
    return { processed };
  });

  await boss.schedule("gdpr.partition_drop", GDPR_CRON_SCHEDULE);

  console.log("[worker] started; gdpr.partition_drop scheduled:", GDPR_CRON_SCHEDULE);
  return boss;
}

if (import.meta.main) {
  await startWorker();
}
