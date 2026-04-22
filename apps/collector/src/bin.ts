#!/usr/bin/env bun
/**
 * `pella` binary entrypoint.
 *
 * Compiled via `bun build --compile` (see apps/collector/package.json
 * build:<target> scripts). One-shot legacy behavior lives in index.ts,
 * which is bundled separately into apps/web/public/collector.mjs for
 * the curl-piped fallback served from /setup/collector.
 */
import { main } from "./cli";

main(process.argv.slice(2)).catch((e) => {
  console.error("pella: fatal", e);
  process.exit(1);
});
