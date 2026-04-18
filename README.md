# Bematist

Open-source (Apache 2.0), self-hostable AI-engineering analytics platform. Auto-instruments every developer's machine to capture all LLM / coding-agent usage (tokens, cost, prompts, sessions, tool calls, outcomes) across every IDE/ADE — Claude Code, Codex, Cursor, OpenCode, Goose, Copilot, Continue.dev, Cline/Roo/Kilo — and ships it to a tenant-owned backend. The manager dashboard correlates LLM spend with Git outcomes (commits, PRs, green tests) and surfaces "why does dev X use ½ the tokens for similar work" via a Clio-style prompt pipeline plus Twin Finder — without shipping per-engineer leaderboards, per-session LLM judgments, or panopticon views.

## What it isn't

| Non-goal | Why |
|---|---|
| Autonomous coaching ("AI suggests a prompt improvement") | Second-order LLM = Goodhart + TOS + cost cliff + privacy. Never ship. |
| Real-time per-engineer event feed | Panopticon. Banned by challenger review. |
| Public per-engineer leaderboards | Works-council BLOCKER in DE/FR/IT; Goodhart-unsafe. |
| Performance-review / promotion-packet surfaces | Explicit product line we refuse to cross. |
| IDE plugin surface | Scope — we observe agents, not editors. |
| Code-quality analysis (lint / complexity over captured code) | Scope — analytics over agent telemetry only. |
| Cross-tenant benchmarking | TOS + antitrust + required trust model we won't ship. |
| Replacing dev LLM API keys / proxy interception | Observe, do not gate. |
| Real-time intervention / blocking | Out of scope forever. |
| Pharos coupling (IPC, Electron, `pharos-ade.com`) | Independent project by brief; never reintroduce. |

## Setup

### Prerequisites

- **Bun** ≥ 1.2 — `curl -fsSL https://bun.sh/install | bash`
- **Docker Desktop** (or compatible engine) for the dev DBs
- A **GitHub account** (required for the OAuth sign-in flow below)

### 1. Clone + install

```bash
git clone git@github.com:pella-labs/bematist.git
cd bematist
bun install
cp .env.example .env    # NEVER commit a .env with real secrets
```

### 2. Create a GitHub OAuth app (for dashboard sign-in)

The dashboard uses **Better Auth with GitHub OAuth** as the sign-in provider (M4 PR 1). You need one OAuth app per environment (local dev, staging, prod). This takes ~2 minutes.

1. Go to https://github.com/settings/applications/new (or your org's Developer settings).
2. Fill in:
   - **Application name** — anything memorable (e.g. `bematist-local`).
   - **Homepage URL** — `http://localhost:3000`.
   - **Authorization callback URL** — `http://localhost:3000/api/auth/callback/github`.
3. Click **Register application**.
4. On the next screen, copy the **Client ID** and click **Generate a new client secret** → copy the secret (shown once).
5. Paste both into your `.env`:
   ```bash
   GITHUB_CLIENT_ID=<your-client-id>
   GITHUB_CLIENT_SECRET=<your-client-secret>
   BETTER_AUTH_URL=http://localhost:3000
   BETTER_AUTH_SECRET=$(openssl rand -hex 32)   # 32-byte random; used to sign session cookies
   ```

**For team-demo over Tailscale (M4 Phase B.2):** repeat the steps above with your tailnet IP (e.g. `http://100.x.y.z:3000`) as the homepage + callback URL. OAuth callbacks won't work through a shared `localhost` redirect across machines.

### 3. Bring up the dev stack

```bash
docker compose -f docker-compose.dev.yml up -d    # postgres + clickhouse + redis only; apps run on the host
```

Health-check:

```bash
docker compose -f docker-compose.dev.yml ps
# all three services should report "healthy"
```

### 4. Migrate + seed

```bash
bun run db:migrate:pg    # drizzle migrations against Postgres (includes Better Auth tables from M4)
bun run db:migrate:ch    # ClickHouse migrations (events table, materialized views, projections)
bun run db:seed          # 3 orgs, 12 developers, 8000 synthetic events, per-org policies rows
```

### 5. Run the apps

```bash
bun run dev    # starts web (:3000), ingest (:8000), worker — all via Bun workspaces
```

All root scripts that touch env vars load `.env` automatically via Bun's `--env-file` flag (see root `package.json`); filtered subprocesses inherit from the parent.

### 6. Sign in

Visit `http://localhost:3000`. You'll be redirected to `/auth/sign-in`. Click **Continue with GitHub**.

- **First user in an org** is automatically promoted to `admin` via Better Auth's `databaseHooks.user.create.after` bridge (see `apps/web/lib/auth-bridge.ts`).
- **Subsequent users** land in the seeded `acme` / `bolt` / `crux` orgs as `role='ic'`. Promote manually via:
  ```bash
  docker exec bematist-postgres psql -U postgres -d bematist \
    -c "UPDATE users SET role='admin' WHERE email='you@example.com';"
  ```

### 7. Mint an ingest key and run the collector

1. In the dashboard, go to **`/admin/ingest-keys`**, pick an engineer, click **Mint**. Copy the bearer shown **exactly once** (format: `bm_<orgSlug>_<keyId>_<secret>`).
2. Build the collector binary for your platform:
   ```bash
   cd apps/collector
   bun build --compile src/index.ts --outfile ../../bin/bematist-darwin-arm64
   # darwin-x64 and linux-x64 targets also work via --target
   ```
3. Dry-run first (logs what *would* be sent, sends nothing — required on first run per Bill of Rights):
   ```bash
   BEMATIST_ENDPOINT=http://localhost:8000 \
   BEMATIST_TOKEN=bm_<your-bearer> \
   ./bin/bematist-darwin-arm64 dry-run
   ```
4. Then run for real:
   ```bash
   BEMATIST_ENDPOINT=http://localhost:8000 \
   BEMATIST_TOKEN=bm_<your-bearer> \
   ./bin/bematist-darwin-arm64 serve
   ```
5. Within ~60s, `/sessions` should show your real Claude Code sessions streaming in.

Other useful collector subcommands: `status` (adapter health + queue depth), `audit --tail` (every byte that left the machine), `doctor` (ulimit + reachability + binary sha check).

### Dev-mode shortcut (skip GitHub OAuth)

Not every local task needs an OAuth round-trip — perf benchmarks, component work, backend iteration. Set one env var and the dashboard treats every request as a seeded admin user:

```bash
BEMATIST_DEV_TENANT_ID=<uuid-of-seeded-org>   # e.g. acme's org id; run `psql ... SELECT id FROM orgs WHERE slug='acme'`
BEMATIST_DEV_ACTOR_ID=<uuid-of-seeded-user>   # optional
BEMATIST_DEV_ROLE=admin                        # optional (default: admin)
```

**Unset these before any publicly-reachable deploy.** The session resolver checks Better Auth first, then the legacy Redis shim, then this env pin — the pin bypasses both auth paths.

## Environment variables

Full reference in [`.env.example`](./.env.example). Highlights:

### Required for the dashboard

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (host port 5433 in dev compose). |
| `CLICKHOUSE_URL` | ClickHouse HTTP endpoint (`http://localhost:8123` in dev). |
| `REDIS_URL` | Redis / Valkey endpoint for dedup + rate limits. |
| `BETTER_AUTH_SECRET` | 32-byte random hex — signs session cookies. |
| `BETTER_AUTH_URL` | Base URL Better Auth builds redirects from (`http://localhost:3000` locally; your tailnet IP for team demos). |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | From the GitHub OAuth app (Setup §2). |

### Required for the collector

| Var | Purpose |
|---|---|
| `BEMATIST_ENDPOINT` | Ingest URL — the sole switch between solo / self-host / managed modes (D2). |
| `BEMATIST_TOKEN` | Bearer minted from `/admin/ingest-keys` (format: `bm_<orgSlug>_<keyId>_<secret>`). |
| `BEMATIST_DATA_DIR` | Egress journal + per-adapter cursor state (default `~/.bematist`). |
| `BEMATIST_LOG_LEVEL` | `warn` by default (quiet dev UX); `info` for debugging. |
| `BEMATIST_DRY_RUN` | `1` = log-only, no egress. Default on first run per Bill of Rights. |
| `BEMATIST_INGEST_ONLY_TO` | Optional egress allowlist (cert-pinned hostname). A compromised binary cannot exfiltrate elsewhere. |

### Optional — embeddings, insights, notifications

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | BYO for the Insight Engine (Haiku 4.5, prompt-cached). Self-host only — managed cloud falls back automatically. |
| `OPENAI_API_KEY` | BYO for the default embedding provider (`text-embedding-3-small` @ 512d). |
| `EMBEDDING_PROVIDER` | `openai` (default) · `voyage` · `ollama-nomic` · `xenova` (air-gapped). |
| `VOYAGE_API_KEY` | Optional premium embedding upgrade (code-trained). |
| `SLACK_WEBHOOK_URL` / `DISCORD_WEBHOOK_URL` | Notifier outputs. |

### Optional — compliance, security, dev-mode

| Var | Purpose |
|---|---|
| `TIER_C_MANAGED_CLOUD_OPTIN_ENFORCED` | Managed-cloud Tier-C 403 guard (default `true`). Self-host can disable. |
| `SIGNED_CONFIG_PUBLIC_KEYS` | Comma-separated 32-byte hex Ed25519 public keys (D20 — admin Tier-C flip). |
| `SLSA_PROVENANCE_KEY` | Installer signature verification. |
| `RLIMIT_CORE` | `0` = crash dumps disabled (security rule). |
| `BEMATIST_DEV_TENANT_ID` / `BEMATIST_DEV_ACTOR_ID` / `BEMATIST_DEV_ROLE` | Dev/perf-only bypass of the auth stack. Pin the dashboard to a seeded org. **Unset in prod.** |

### Optional — GitHub App (outcome attribution, Workstream C)

| Var | Purpose |
|---|---|
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY_PATH` / `GITHUB_APP_WEBHOOK_SECRET` / `GITHUB_APP_CLIENT_ID` | `bematist-github` app credentials — webhook HMAC, PR reconciliation, check-suite tracking. |

## Scripts

```bash
bun run lint                # biome
bun run typecheck           # tsc --noEmit across workspaces
bun run test                # bun test (unit + integration)
bun run test:e2e            # playwright (apps/web)
bun run test:privacy        # privacy adversarial suite — merge-blocking
bun run test:scoring        # 500-case AI Leverage Score eval (MAE ≤ 3) — merge-blocking on scoring changes
bun run test:perf           # k6 perf (gates Sprint 2)

bun run db:migrate:pg       # drizzle migrations
bun run db:migrate:ch       # clickhouse migrations
bun run db:seed             # dev data: 3 orgs, 12 devs, 8000 events, per-org policies
```

## Production install

### Collector (dev machine)

Distro packages are the primary path — Homebrew, apt/deb, AUR, Chocolatey. See [`packaging/README.md`](./packaging/README.md) for per-platform instructions and the signature verification flow (Sigstore + cosign + SLSA Level 3).

Released binaries are signed; verify before use. The default install is `gh release download` + `cosign verify`, not `curl | sh`. The GitHub Releases page is the source of truth.

### Server (self-host)

```bash
docker compose -f docker-compose.yml up        # web + ingest + worker + postgres + clickhouse + redis
docker compose --profile otel-collector up     # opt-in OTel collector sidecar
```

### Per-dev port overrides

If the default dev ports (5433 pg, 6379 redis, 8000 ingest, 3000 web) collide with other projects on your machine, create `docker-compose.dev.local.yml` and remap there (gitignored via `docker-compose.*.local.yml`):

```yaml
services:
  postgres:
    ports: ["5435:5432"]
  redis:
    ports: ["6381:6379"]
```

Bring both files up merged:

```bash
docker compose -f docker-compose.dev.yml -f docker-compose.dev.local.yml up -d
```

Update matching URLs (`DATABASE_URL`, `REDIS_URL`) in your `.env` to the remapped ports. The tracked `docker-compose.dev.yml` stays at upstream defaults.

## Status

Pre-M1. Foundation + Sprint-0 scaffolding landed; M1 vertical slice (teams 2×2, clusters Twin Finder, insights digest, sessions virtualized list) shipped at commit `0bc7d9f`.

- API shape locked: Next.js Server Actions + Route Handlers (no tRPC). Zod schemas in `packages/api/src/schemas/` are the input/output source of truth.
- Queries are fixture-backed today via `packages/fixtures`. Flip to real DBs with `USE_FIXTURES=0` once Postgres + ClickHouse are seeded (lane 1 is wiring this).
- Privacy defaults: Tier B (counters + redacted envelopes). Tier C opt-in only. See `CLAUDE.md` §Security Rules.
- Scale target (day one): 10k devs / 8M events/day · p95 dashboard <2s · p99 ingest <100ms.

See `dev-docs/PRD.md` for the locked plan and `WORKSTREAMS.md` for the per-owner split.

## Contributing

- **`CLAUDE.md` is the canonical conventions doc — read it first.** It locks the tech stack, non-goals, privacy tiers, scoring math, adapter matrix, and testing gates. Everything else should be consistent with it; if it conflicts with `dev-docs/PRD.md`, the PRD wins and `CLAUDE.md` gets updated.
- Pull-request template and privacy invariants are in `.github/pull_request_template.md`.
- Security disclosure: see [`SECURITY.md`](./SECURITY.md).
- Reference architecture, decisions D1–D32, and rationale: `dev-docs/PRD.md` + `dev-docs/summary.md`.

## License

Apache 2.0. See `LICENSE` (agent, dashboard, adapters, schemas, CLI). A small set of enterprise-layer components (gateway, admin, SSO/SCIM, audit-log export, DP, compliance signing, cold-archive, MCP read-API) are BSL 1.1 with a 4-year Apache 2.0 conversion window — see PRD §D18.
