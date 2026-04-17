// Phase 1 RLIMIT_CORE handling. Crash-dump files can leak Tier-C prompt text
// and secrets to disk; ulimit -c 0 is also required on Dockerfile entrypoint
// (Sebastian/Foundation). This file is the in-process belt.
//
// On Node/Bun, process.setrlimit is not always exposed. We call it defensively.

type RlimitProc = NodeJS.Process & {
  setrlimit?: (resource: string, limits: { soft: number; hard: number }) => void;
  getrlimit?: (resource: string) => { soft: number; hard: number };
};

export interface CoreRlimitResult {
  /** The soft limit after (or before, if we could not set it). */
  rlimit_core: number;
  /** Whether the platform exposed a setrlimit API we could call. */
  applied: boolean;
  /** Error message if setrlimit threw. */
  error?: string;
}

export interface RlimitLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  error?: (obj: Record<string, unknown>, msg?: string) => void;
}

export function applyCoreRlimit(logger: RlimitLogger): CoreRlimitResult {
  const proc = process as RlimitProc;
  let rlimitCore = 0;
  let applied = false;
  let error: string | undefined;

  try {
    if (typeof proc.setrlimit === "function") {
      proc.setrlimit("core", { soft: 0, hard: 0 });
      applied = true;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  try {
    if (typeof proc.getrlimit === "function") {
      const r = proc.getrlimit("core");
      rlimitCore = r.soft ?? 0;
    }
  } catch {
    // ignore; keep rlimit_core at 0 default
  }

  const result: CoreRlimitResult =
    error !== undefined
      ? { rlimit_core: rlimitCore, applied, error }
      : { rlimit_core: rlimitCore, applied };

  // Mandatory banner: even if we could not actually set it, log the observed
  // value so operators see the posture. Phase 1 test #13 asserts `rlimit_core`
  // key is present.
  logger.info({ rlimit_core: result.rlimit_core, applied: result.applied }, "rlimit.core applied");

  if (result.rlimit_core > 0 && logger.error) {
    logger.error(
      { rlimit_core: result.rlimit_core },
      "rlimit.core > 0 — crash dumps enabled; Dockerfile ulimit -c 0 required",
    );
  }

  return result;
}
