/**
 * Provider dispatcher. Use `getProvider(org.provider)` instead of branching on
 * provider name in business logic. See docs/multi-provider.md §4.
 */

import { githubProvider } from "./github";
import { gitlabProvider } from "./gitlab";
import type { Provider, ProviderName } from "./types";

const REGISTRY: Record<ProviderName, Provider> = {
  github: githubProvider,
  gitlab: gitlabProvider,
};

export function getProvider(name: ProviderName): Provider {
  const p = REGISTRY[name];
  if (!p) throw new Error(`Unknown provider: ${name}`);
  return p;
}

export type { Provider, ProviderName, ConnectableOrg, ChangeRequestAgg, InviteResult, MemberRef } from "./types";
export { ProviderError, mapHttpStatusToProviderError } from "./errors";
