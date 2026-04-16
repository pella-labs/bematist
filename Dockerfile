# Bematist — multi-stage Dockerfile stub.
# Real app builds land with workstream owners in Sprint 1+.
# Security rule (CLAUDE.md): crash dumps disabled via ulimit -c 0 + RLIMIT_CORE=0.

# ─── Base ──────────────────────────────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS base
WORKDIR /app
RUN apk add --no-cache tini
# Disable core dumps at container-entrypoint level
ENV RLIMIT_CORE=0
ENTRYPOINT ["/sbin/tini", "--"]

# ─── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json bun.lock ./
COPY apps apps
COPY packages packages
RUN bun install --frozen-lockfile

# ─── Ingest ────────────────────────────────────────────────────────────────────
FROM deps AS ingest-build
RUN bun --filter='@bematist/ingest' build

FROM base AS ingest
COPY --from=ingest-build /app/apps/ingest/dist ./dist
COPY --from=ingest-build /app/node_modules ./node_modules
EXPOSE 8000 4318
CMD ["sh", "-c", "ulimit -c 0 && bun dist/index.js"]

# ─── Worker ────────────────────────────────────────────────────────────────────
FROM deps AS worker-build
RUN bun --filter='@bematist/worker' build

FROM base AS worker
COPY --from=worker-build /app/apps/worker/dist ./dist
COPY --from=worker-build /app/node_modules ./node_modules
CMD ["sh", "-c", "ulimit -c 0 && bun dist/index.js"]

# ─── Web ───────────────────────────────────────────────────────────────────────
FROM deps AS web-build
RUN bun --filter='@bematist/web' build

FROM base AS web
COPY --from=web-build /app/apps/web/.next/standalone ./
COPY --from=web-build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["sh", "-c", "ulimit -c 0 && bun apps/web/server.js"]
