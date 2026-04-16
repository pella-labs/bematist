import pino from "pino";

// Singleton pino logger. Level from LOG_LEVEL env (default "info").
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { svc: "bematist-ingest" },
});
