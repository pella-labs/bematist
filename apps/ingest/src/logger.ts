import pino from "pino";

// Singleton pino logger. Level from LOG_LEVEL env (default "info").
// In test environments (Bun.jest / BUN_ENV=test) default to "silent" so
// the suite output isn't drowned in structured log lines.
const defaultLevel =
  process.env.NODE_ENV === "test" || process.env.BUN_ENV === "test" ? "silent" : "info";
export const logger = pino({
  level: process.env.LOG_LEVEL ?? defaultLevel,
  base: { svc: "bematist-ingest" },
});
