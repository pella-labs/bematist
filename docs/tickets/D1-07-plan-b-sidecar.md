# D1-07 Primer: Plan-B Go sidecar skeleton (F15 / INT0 fallback)

**For:** Fresh session authoring the Plan-B Go sidecar
**Project:** bema (DevMetrics)
**Workstream:** D (Storage & Schema)
**Date:** 2026-04-17 (planned)
**Previous work:** None hard — independent of `D1-02..06`. Must ship **before Sprint 1 ends** regardless of priority. See `docs/DEVLOG.md`.

---

## What Is This Ticket?

A documented + running Go sidecar skeleton at `apps/ingest-sidecar/` that Bun ingest can fail over to if the 24h Bun↔ClickHouse soak (F15 / INT0) shows flakes via `@clickhouse/client` HTTP. Does NOT replace `@clickhouse/client` today — skeleton only. If the soak fails, hot-path writes switch to sidecar-over-UNIX-socket in a one-line change; if the soak passes, this stays on ice and the sidecar never ships to production.

### Why It Matters

- **CLAUDE.md Architecture Rule #7:** "Plan B must be documented and ready before Sprint 1 starts — don't discover this in Sprint 5."
- Buys optionality. If F15 fails in Sprint 2 and we have no Plan B, we're stuck rewriting the hot path under duress.
- Low-risk: skeleton only. Zero production impact unless activated.

---

## What Was Already Done

- `apps/` has `collector`, `ingest`, `web`, `worker` — sidecar dir doesn't exist.
- Go 1.26.1 installed on local machine.
- `@clickhouse/client` pinned in Bun ingest (contract 02).

---

## What This Ticket Must Accomplish

### Goal

`apps/ingest-sidecar/` is a working Go binary that accepts events on a UNIX socket and writes them to ClickHouse; Bun ingest has a commented-out code path that would route to it; docs describe how to flip the switch if F15 soak fails.

### Deliverables Checklist

#### A. Implementation

- [ ] `apps/ingest-sidecar/go.mod`, `go.sum` — Go 1.22+ module (pinned).
- [ ] `apps/ingest-sidecar/cmd/sidecar/main.go`:
  - Listen on UNIX socket at `$DEVMETRICS_SIDECAR_SOCKET` (default `/tmp/devmetrics-sidecar.sock`).
  - Accept newline-delimited JSON events (same schema as contract 01 `Event`).
  - Batch up to 1000 events / 500ms, INSERT into ClickHouse via `github.com/ClickHouse/clickhouse-go/v2`.
  - Respond with `{"accepted": N, "deduped": M, "request_id": "..."}` per contract 02.
- [ ] `apps/ingest-sidecar/Dockerfile` — multi-stage: `golang:1.22-alpine` builder, `gcr.io/distroless/static` final.
- [ ] `apps/ingest-sidecar/README.md` — explains:
  - When to use (F15 soak failure).
  - How to start: `go run ./cmd/sidecar` for dev; Docker for prod.
  - How Bun ingest connects (commented-out code in `apps/ingest/src/clickhouse.ts`).
  - Perf targets: p99 insert < 50ms for 1000-event batches.
- [ ] `apps/ingest/src/clickhouse.ts` — add a commented-out code block showing the switch to UNIX-socket transport. Do NOT enable by default.
- [ ] `docker-compose.dev.yml` — add `ingest-sidecar` service under a new `sidecar` profile (not default-up):
  ```yaml
  services:
    ingest-sidecar:
      profiles: ["sidecar"]
      build: ./apps/ingest-sidecar
      volumes:
        - /tmp/devmetrics-sidecar.sock:/tmp/devmetrics-sidecar.sock
  ```

#### B. Tests

- [ ] `apps/ingest-sidecar/cmd/sidecar/main_test.go` — happy path: send 100 events, assert CH row count = 100.
- [ ] Idempotency test: send same `client_event_id` twice, assert one row (CH's ReplacingMergeTree picks up; sidecar itself is best-effort).
- [ ] Batching test: send 1000 events in 100 batches of 10, confirm single-CH-insert batch groups (sample logs).
- [ ] Load test (non-CI, manual): 100 evt/sec for 30 min; p99 < 50ms. Document in PR.

#### C. Integration Expectations

- [ ] Sidecar speaks the same `Event` schema as contract 01 — JSON NDJSON on UNIX socket.
- [ ] Bun ingest remains authoritative writer (contract 09 invariant 1); the sidecar is an alternate writer pattern behind the same ingest surface.
- [ ] Redis SETNX dedup happens in Bun ingest BEFORE sidecar receives — sidecar trusts its input.
- [ ] No auth on UNIX socket — file permissions are the boundary (`0600`, process-owned).

#### D. Documentation

- [ ] `apps/ingest-sidecar/README.md` (primary deliverable)
- [ ] Append DEVLOG
- [ ] Tickets README ✅
- [ ] `WORKSTREAMS.md` — note sidecar is Jorge's, ready for activation if F15 fails
- [ ] No contract change — contract 09 §Plan B already documents this

---

## Branch & Merge Workflow

```bash
git switch main && git pull
git switch -c D1-07-plan-b-sidecar-jorge

# Standard Go module scaffolding
cd apps/ingest-sidecar
go mod init github.com/pella-labs/bematist/apps/ingest-sidecar
# ... implement ...
go test ./...
cd ../..

bun run lint && bun run typecheck && bun run test  # TS paths unaffected

git push -u origin D1-07-plan-b-sidecar-jorge
gh pr create --base main \
  --title "feat(sidecar): Plan-B Go ingest sidecar skeleton (D1-07)" \
  --body "Refs #3"
```

---

## Important Context

### Files to Create

| File | Why |
|------|-----|
| `apps/ingest-sidecar/go.mod` | Go module |
| `apps/ingest-sidecar/cmd/sidecar/main.go` | Entrypoint |
| `apps/ingest-sidecar/internal/ch/writer.go` | CH batched writer |
| `apps/ingest-sidecar/internal/socket/server.go` | UNIX socket server |
| `apps/ingest-sidecar/Dockerfile` | Distroless image |
| `apps/ingest-sidecar/README.md` | Activation guide |
| `apps/ingest-sidecar/cmd/sidecar/main_test.go` | Tests |

### Files to Modify

| File | Action |
|------|--------|
| `docker-compose.dev.yml` | Add `ingest-sidecar` under `sidecar` profile |
| `apps/ingest/src/clickhouse.ts` | Add commented-out socket-writer path |
| `WORKSTREAMS.md` | Note sidecar status |
| `docs/DEVLOG.md` | Append |
| `docs/tickets/README.md` | ✅ |

### Files You Should NOT Modify

- `contracts/09-storage-schema.md` — Plan B section already documents this
- `contracts/01-event-wire.md` — same Event schema, no contract change
- Bun ingest default code path — this is skeleton only

### Files You Should READ for Context

| File | Why |
|------|-----|
| `contracts/09-storage-schema.md` §Plan B | Scope + activation criteria |
| `contracts/01-event-wire.md` §Schema | Event shape the sidecar must accept |
| `CLAUDE.md` Architecture Rule #7 | Must ship before Sprint 1 ends |
| `dev-docs/PRD.md` §F15 / INT0 | 24h soak criteria that trigger activation |

---

## Architectural Decisions

| Decision | Reference | Summary |
|----------|-----------|---------|
| Language | — | Go — mature CH driver, stable perf under pressure. |
| Transport | §09 | UNIX socket. File-permission auth; low overhead. |
| Activation | §F15 | Manual flip after soak failure; not default-on. |
| Auth | — | File permissions (0600, process-owned); no bearer on socket. |

---

## Suggested Implementation Pattern

```go
// apps/ingest-sidecar/cmd/sidecar/main.go
package main

import (
    "bufio"
    "context"
    "encoding/json"
    "net"
    "os"
    "time"

    "github.com/ClickHouse/clickhouse-go/v2"
)

type Event map[string]any

func main() {
    sock := getenv("DEVMETRICS_SIDECAR_SOCKET", "/tmp/devmetrics-sidecar.sock")
    _ = os.Remove(sock)

    listener, err := net.Listen("unix", sock)
    must(err)
    must(os.Chmod(sock, 0o600))

    ch := openCH()
    defer ch.Close()

    batcher := newBatcher(ch, 1000, 500*time.Millisecond)
    go batcher.run(context.Background())

    for {
        conn, err := listener.Accept()
        if err != nil { continue }
        go handleConn(conn, batcher)
    }
}
```

---

## Edge Cases to Handle

1. **CH unavailable.** Sidecar retries with exponential backoff; logs but does not crash. Bun ingest's egress journal is the backstop.
2. **Socket file-permission conflict.** If the socket path exists, `os.Remove` it (previous run crashed).
3. **Batch flush on shutdown.** `SIGTERM` → drain pending batches before exit.
4. **Schema drift.** Sidecar accepts JSON maps (untyped); CH driver handles column mapping. If a new column ships, sidecar works without recompile (flexible ingestion).

---

## Definition of Done

- [ ] Go module builds: `go build ./...` clean
- [ ] `go test ./...` passes
- [ ] Dockerfile builds; image runs in `docker compose --profile sidecar up`
- [ ] README documents activation sequence
- [ ] Bun ingest has commented-out switch path
- [ ] Load test result in PR (100 evt/sec × 30 min; p99 < 50ms)
- [ ] DEVLOG entry
- [ ] Tickets README ✅
- [ ] Branch pushed, PR `Refs #3`

---

## Estimated Time

| Task | Estimate |
|------|----------|
| Go module scaffold | 30 min |
| Socket server + batcher | 2 h |
| CH writer | 90 min |
| Dockerfile + compose profile | 45 min |
| Tests | 2 h |
| Load test run + README | 90 min |

~7–8 h.

---

## After This Ticket: What Comes Next

- Sprint 2 (H-AI) begins — embed provider abstraction, Insight Engine 6-call pipeline, anomaly detector, LLM-judge eval.
- If F15 soak fails in Sprint 2: flip the switch, test under load, ship.
- If F15 soak passes: sidecar stays on ice; revisit only if CH driver regresses.
