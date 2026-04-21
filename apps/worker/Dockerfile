# Bema worker — Railway deployment Dockerfile (single-stage).
#
# Mirrors apps/ingest/Dockerfile — single-stage so Bun workspace symlinks
# stay intact. The worker has no public HTTP surface; it runs:
#   - PgBoss crons (GDPR partition drop, anomaly, recluster, GitHub initial
#     sync dispatcher, linker partition creator / alias retirement /
#     reconcile scaffold)
#   - Kafka consumer for `github.webhooks` (opt-in via KAFKA_TRANSPORT=kafkajs)
#   - Redis Streams consumer for `session_repo_recompute:<tenant_id>` (linker)
#
# Railway-specific:
#   - Private networking: DATABASE_URL, REDIS_URL, KAFKA_BROKERS resolve to
#     `.railway.internal` hostnames via env refs.
#   - CLICKHOUSE_URL points at CH Cloud over public internet (creds in URL).
#   - No EXPOSE — worker is internal-only. No healthcheck path.

FROM oven/bun:1.3-alpine

WORKDIR /app

# Copy the whole workspace — Railway's .railwayignore trims the noise.
COPY . .

RUN bun install --frozen-lockfile

WORKDIR /app/apps/worker

# `ulimit -c 0` at shell start disables crash dumps (CLAUDE.md §Security Rules
# — belt) — runtime code can also call applyCoreRlimit() (suspenders).
USER bun
CMD ["/bin/sh", "-c", "ulimit -c 0 && exec bun src/index.ts"]
