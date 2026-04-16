# Bematist

> Repo slug for **DevMetrics** — open-source AI-engineering analytics platform. See `dev-docs/PRD.md` (locked) and `CLAUDE.md` (conventions).

## Quickstart

```bash
bun install                                          # install workspace deps
docker compose -f docker-compose.dev.yml up -d       # postgres + clickhouse + redis
cp .env.example .env                                 # fill in secrets

bun run lint                                         # biome
bun run typecheck                                    # tsc --noEmit across all workspaces
bun run test                                         # bun test
```

## Layout

```
apps/      # web, ingest, collector, worker
packages/  # schema, sdk, api, otel, ui, redact, embed, scoring, clio, fixtures, config
contracts/ # cross-workstream seam contracts (01..09)
dev-docs/  # PRD (locked), summary (decisions), archived research
legal/     # compliance templates (Sprint 3+)
infra/     # otel-collector config (optional sidecar)
```

## Workstreams

Five people, five owners — see `WORKSTREAMS.md`. **Sebastian** owns Foundation (this PR).

## Branch protection

Configure in GitHub → Settings → Branches → `main`:

- Require pull request before merging.
- Require status check: `ci / build` (the only job defined in `.github/workflows/ci.yml`).
- Dismiss stale reviews, require branches to be up to date.

## Host port mapping (dev)

The dev Postgres binds to host port **5433** (not 5432) to avoid collision with other projects. Container still listens on 5432. `DATABASE_URL` in `.env.example` reflects this.

## Locked rules

- Product name is **DevMetrics**; repo slug is `bematist`; workspace packages are `@bematist/*` per decision from Sprint 0 kickoff.
- Tier-B privacy default (not C). See `CLAUDE.md` §"Privacy Model Rules".
- No Pharos anything (PRD §D1).
