// G1 Linker worker — package-level exports.
//
// See CLAUDE.md §Architecture Rule #4: Redis Streams for per-event work,
// PgBoss for crons. This package splits the two:
//   - consumer.ts: Redis Streams loop (per-event).
//   - partitionCreator.ts / aliasRetirement.ts / reconcileScaffold.ts:
//     PgBoss-scheduled crons.
//
// State computation lives in `state.ts` and is pure — see
// `commutativity.test.ts` for the merge-blocker invariant.

export { FsAliasArchiver, runAliasRetirement } from "./aliasRetirement";
export { canonicalJson, canonicalSha256 } from "./canonical";
export { WindowCoalescer } from "./coalescer";
export { createLinkerConsumer, DEFAULT_GROUP, LinkerConsumer, STREAM_PREFIX } from "./consumer";
export { authoritativeHash, defaultTenantSalt, placeholderFor, repoIdHash } from "./hash";
export { decodeMessage, encodeWebhookMessage, fieldsToRecord } from "./messageShape";
export { ensurePartitionsFor } from "./partitionCreator";
export { runReconcileScaffold } from "./reconcileScaffold";
export {
  type Alias,
  assertEvidenceSafe,
  computeLinkerState,
  type Deployment,
  type ForcePushTombstone,
  type Installation,
  type LinkerInputs,
  type LinkerState,
  type PullRequest,
  type Repo,
  resolveEligibility,
  type SessionEnrichment,
  type SessionRepoEligibilityRow,
  type SessionRepoLinkRow,
  SYSTEM_CLOCK,
  type TrackingMode,
} from "./state";
export {
  clearStaleForInstallation,
  markLinksStaleForInstallation,
  type WriteResult,
  writeLinkerState,
} from "./writer";
