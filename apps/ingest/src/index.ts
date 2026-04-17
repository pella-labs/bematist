import { logger } from "./logger";
import { applyCoreRlimit } from "./rlimit";
import { startServer } from "./server";

// Phase 1: disable core dumps before accepting traffic. Crash dump files can
// leak Tier-C prompt text and secrets to disk. The Dockerfile entrypoint
// (`ulimit -c 0`) is the belt; this is the suspenders.
applyCoreRlimit(logger);

startServer();
