# Follow-up — GitHub App Manifest Flow (one-click customer onboarding)

> **Status:** DEFERRED. Do not build before the first dev deploy on Railway or the first teammate-exploration pass on Pella Labs. Build before the **first external customer** onboarding.
>
> **Scope estimate:** 1–2 engineer days.
>
> **Opened by:** deployment-planning conversation on 2026-04-19 while scoping Railway dev cutover for PR #92 (GitHub Integration v1).

## Why this exists

Our current GitHub App onboarding path requires a customer admin to:

1. Navigate to `github.com/organizations/<their-org>/settings/apps/new`.
2. Fill in ~8 fields (App name, Homepage URL, Callback URL, Webhook URL, Webhook secret, Permissions matrix, Event subscriptions, Install target).
3. Click through the permissions consent screen.
4. Download the private key `.pem`.
5. Paste the private key + App ID + webhook secret into their Bematist deployment's env vars (or into our hosted tenant config surface when that ships).
6. Separately install the App on their org and pick repos.

That is fine for our own Pella Labs dev deploy — it happens once — but it is not acceptable customer UX. Every mature GitHub-integrated product solves this the same way: the **GitHub App Manifest Flow**.

## What the Manifest Flow does

GitHub exposes a programmatic registration endpoint that takes a JSON **manifest** describing the App's config and returns a created App (ID + private key + webhook secret) after a **single consent click** from the admin. No form-filling, no private-key download-and-paste, no manual permission matrix selection.

Prior art — this is the exact pattern Vercel, Netlify, Sentry, Shortcut (Clubhouse), Trunk.io, and CodeRabbit use.

## The flow, end-to-end

```
┌──────────────────────┐           ┌───────────────────────────┐            ┌────────────────────┐
│  Customer admin on   │  1. POST  │  Bematist web            │  2. 302    │  github.com/settings│
│  bematist.dev/       │◀──────────▶│  /api/github/manifest/   │◀──────────▶│  /apps/new?state=   │
│  onboarding/github   │           │  initiate                 │            │  X&manifest={JSON} │
└──────────────────────┘           └───────────────────────────┘            └────────────────────┘
                                                                                      │
                                                                       3. admin clicks
                                                                          "Create GitHub App"
                                                                                      │
                                                                                      ▼
┌──────────────────────┐           ┌───────────────────────────┐            ┌────────────────────┐
│  github.com redirects│  4. GET   │  Bematist web            │  5. POST   │  api.github.com/    │
│  to our callback     │──────────▶│  /api/github/manifest/   │──────────▶│  app-manifests/     │
│  with ?code=ABC      │           │  callback?code=ABC       │            │  ABC/conversions    │
└──────────────────────┘           └───────────────────────────┘            └────────────────────┘
                                                                                      │
                                                                       6. response: {
                                                                            id, pem,
                                                                            webhook_secret,
                                                                            client_id,
                                                                            client_secret,
                                                                            html_url
                                                                          }
                                                                                      │
                                                                                      ▼
                                                 7. store in tenant config; redirect admin to
                                                    /settings/github/install to install the App
```

The magic: steps 2 and 6 mean the customer never types an ID, downloads a PEM, or copies a webhook secret. GitHub hands us all of that in exchange for the admin's single consent click.

## What we need to build

### 1. Manifest-initiate route — `apps/web/app/api/github/manifest/initiate/route.ts`

- Requires authenticated admin session (Better Auth).
- Generates a cryptographically-random `state` (hex, 32 bytes) bound to `{tenant_id, user_id, issued_at}`; stores it in Redis with a 10-minute TTL.
- Composes the manifest JSON — see §"Manifest shape" below.
- HTTP-302s to `https://github.com/settings/apps/new?state=<state>&manifest=<url-encoded JSON>` (personal account target) OR `https://github.com/organizations/<org>/settings/apps/new?state=<state>&manifest=<url-encoded JSON>` (org target, when the admin knows which org).

### 2. Manifest-callback route — `apps/web/app/api/github/manifest/callback/route.ts`

- Reads `?code=<conversion_code>&state=<state>`.
- Validates the `state` against Redis; reject on miss or expiry.
- `POST https://api.github.com/app-manifests/{code}/conversions` (no auth required — the code is single-use and expires in 1 hour).
- Receives `{ id, slug, node_id, owner, name, description, external_url, html_url, events, permissions, pem, webhook_secret, client_id, client_secret }`.
- Writes:
  - `github_installations.app_id = id`
  - `github_installations.app_slug = slug`
  - `github_installations.webhook_secret_active_ref = <new ref>` (seeded in secrets resolver with `webhook_secret`)
  - Secret store: `pem` under `github_app_private_key_ref` (KMS in prod, filesystem + 0600 in dev).
- Redirects admin to `/settings/github/install?app_slug=<slug>` which then links out to `github.com/apps/<slug>/installations/new` to pick target org + repos.

### 3. Manifest shape

```json
{
  "name": "Bematist — AI Engineering Analytics",
  "url": "https://bematist.dev",
  "hook_attributes": {
    "url": "https://ingest.bematist.dev/v1/webhooks/github",
    "active": true
  },
  "redirect_url": "https://<tenant-domain>/api/github/manifest/callback",
  "callback_urls": [
    "https://<tenant-domain>/admin/github/installed"
  ],
  "setup_url": "https://<tenant-domain>/admin/github/setup",
  "setup_on_update": true,
  "public": false,
  "default_permissions": {
    "contents": "read",
    "metadata": "read",
    "pull_requests": "read",
    "statuses": "read",
    "checks": "read",
    "actions": "read",
    "members": "read"
  },
  "default_events": [
    "pull_request",
    "pull_request_review",
    "push",
    "workflow_run",
    "check_suite"
  ]
}
```

Exact permissions + events must match CLAUDE.md §Outcome Attribution Rules and PRD §11. Keep them in sync with whatever is authoritative at the time this ships.

### 4. Secrets handling

- On self-host: write the PEM to `${DATA_DIR}/github/app-<id>.pem` with `0600` permissions. Seed the webhook secret into the filesystem-backed `WebhookSecretResolver`.
- On managed cloud: push PEM + webhook secret into the KMS-backed resolver. Never log them, never surface them in API responses.

### 5. Tenant-isolation check

The manifest flow **must not** allow one tenant to register an App whose webhook URL points at another tenant's ingest endpoint. Enforce this in the initiate route: `hook_attributes.url` and `redirect_url` are derived from the authenticated session's tenant, never from user input.

### 6. Tests (follow `apps/web/app/api/admin/github/routes.test.ts` pattern)

- Initiate: happy path returns 302 with state in URL + Redis.
- Initiate: unauthenticated → 401.
- Callback: happy path — mock conversions endpoint, assert DB writes, assert redirect.
- Callback: state miss / expired → 400 + no DB write.
- Callback: conversion POST 4xx → surfaces a user-visible error, no partial state.
- Adversarial: state-replay attack (reuse same state twice) → second request rejected.

## Why we are NOT building this before the dev deploy

1. Pella Labs onboarding is a one-time manual step; Manifest Flow saves ~15 minutes of form-filling and one PEM paste. Not worth gating the dev cutover on.
2. The Manifest Flow is harder to iterate on than the manual path because each end-to-end test creates a real App in some GitHub org. The manual path lets us mutate the App's permissions/events/webhook URL via the GitHub UI while we're still tuning the integration.
3. We do not yet have the tenant-domain infrastructure in place (`<tenant>.bematist.dev` or similar). The manifest's `hook_attributes.url` + `redirect_url` + `callback_urls` need a stable per-tenant origin that doesn't exist yet on dev.

Revisit after:
- First customer contract is signed OR the first self-host deployment request comes in (whichever is sooner).
- Tenant-domain routing is working in prod (static `bematist.dev/tenant/<slug>` or subdomains).

## How to pick up this work

```
read dev-docs/followup-github-app-manifest-flow.md and CLAUDE.md.
work in a worktree-isolated agent. implement §"What we need to build" items 1–6 in order.
open a PR named "feat(github): manifest flow — one-click app creation". do not merge.
```

Standard preamble from `dev-docs/m2-gate-agent-team.md` §7 applies (CLAUDE.md, PRD, contracts; worktree; commit trailer; no merge).

## References

- GitHub docs: https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
- The flow is documented under GitHub's REST API `POST /app-manifests/{code}/conversions`.
- Vercel's implementation is the reference UX (admin clicks "Connect GitHub" → one consent screen → lands back in Vercel with the App ready to install).
