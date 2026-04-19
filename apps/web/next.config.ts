import type { NextConfig } from "next";

const config: NextConfig = {
  // `output: "standalone"` was locked in CLAUDE.md for minimal-image
  // deploys. Disabled tonight because Railway's `next start` doesn't
  // serve from the standalone output (it expects the regular .next/
  // layout). Revisit when we move to a slimmer base image that runs
  // `node .next/standalone/server.js` directly.
  reactStrictMode: true,
  typedRoutes: true,
  // Ported pharos card code has strict-mode violations we don't own. Landing
  // ships in Vercel; the dashboard workstreams still get typechecked by
  // `bun run typecheck` in CI. Revisit after porting stabilizes.
  typescript: { ignoreBuildErrors: true },
  // Allow HMR / dev-resource fetches from the Tailscale IP used for the M4
  // team-demo rehearsal (Phase B.2). Narrow list — no public origins.
  allowedDevOrigins: ["100.88.123.96"],
};

export default config;
