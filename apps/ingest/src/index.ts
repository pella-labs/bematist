import { verifyBearer } from "./auth";
import { createLazyClickHouseWriter, defaultClickHouseConfig } from "./clickhouse";
import { getDeps, setDeps } from "./deps";
import { assertFlagCoherence, FlagIncoherentError, parseFlags } from "./flags";
import { logger } from "./logger";
import { startOtlpServer } from "./otlp/server";
import { applyCoreRlimit } from "./rlimit";
import { startServer } from "./server";
import { createWalConsumer } from "./wal/consumer";

// Phase 1: disable core dumps before accepting traffic. Crash dump files can
// leak Tier-C prompt text and secrets to disk. The Dockerfile entrypoint
// (`ulimit -c 0`) is the belt; this is the suspenders.
applyCoreRlimit(logger);

// Phase 4: parse flags and enforce coherence before wiring anything.
const flags = parseFlags(process.env as Record<string, string | undefined>);
try {
  assertFlagCoherence(flags);
} catch (e) {
  if (e instanceof FlagIncoherentError) {
    logger.error({ code: e.code, details: e.details }, "flag incoherent");
  } else {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, "flag check failed");
  }
  process.exit(2);
}

// Phase 4: swap the default in-memory ClickHouse writer for the lazy client
// wrapper in production. The in-memory writer is retained for tests (NODE_ENV=test).
if (process.env.NODE_ENV !== "test" && flags.CLICKHOUSE_WRITER === "client") {
  setDeps({ clickhouseWriter: createLazyClickHouseWriter(defaultClickHouseConfig) });
}

const ingestServer = startServer();

// Phase 5: start OTLP receiver on :4318 when flag is on. Skipped in tests so
// bun test doesn't bind a port. SIGTERM hook below stops both servers.
let otlpHandle: ReturnType<typeof startOtlpServer> | null = null;
if (flags.OTLP_RECEIVER_ENABLED && process.env.NODE_ENV !== "test") {
  const deps = getDeps();
  otlpHandle = startOtlpServer({
    port: 4318,
    deps: {
      flags,
      wal: deps.wal,
      dedupStore: deps.dedupStore,
      orgPolicyStore: deps.orgPolicyStore,
      rateLimiter: deps.rateLimiter,
    },
    verify: (header) => verifyBearer(header, deps.store, deps.cache),
  });
}

if (process.env.NODE_ENV !== "test") {
  process.on("SIGTERM", () => {
    logger.info({}, "SIGTERM received, draining");
    try {
      ingestServer.stop(true);
    } catch {
      // ignore
    }
    if (otlpHandle) {
      void otlpHandle.stop();
    }
  });
}

// Phase 4: start WAL consumer if enabled. Skipped in tests so bun test doesn't
// spawn a background loop that leaks across suite boundaries.
if (flags.WAL_CONSUMER_ENABLED && process.env.NODE_ENV !== "test") {
  // Real Redis client wiring lands when Bun 1.2.9+ `Bun.redis` is available;
  // until then, the consumer boot is a no-op on self-host unless a WalRedis
  // is provided via setDeps at deploy time. We log the readiness so ops know.
  logger.info({ flag: "WAL_CONSUMER_ENABLED" }, "wal consumer enabled (redis wiring pending)");
  // Placeholder: once Redis wiring lands, uncomment:
  //   const consumer = createWalConsumer({ redis: realRedis, ch: getDeps().clickhouseWriter });
  //   await consumer.start();
  //   process.on("SIGTERM", () => { void consumer.stop(); });
  // For now, reference the symbol so tree-shaking doesn't drop it.
  void createWalConsumer;
}
