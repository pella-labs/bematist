/**
 * Per-provider UI metadata. Components that show provider-specific copy must
 * read from this object instead of branching on `org.provider`. Adding a new
 * provider = adding one entry here. See docs/multi-provider.md §9.
 */

import type { ProviderName } from "./types";
import { GithubIcon, GitlabIcon } from "./icons";

export type ProviderUiConfig = {
  name: string;                 // Display name ("GitHub" / "GitLab")
  Icon: typeof GithubIcon;
  accent: string;               // Foreground / icon color
  brand: string;                // Background-tint base color
  nounSingular: string;         // "PR" / "MR"
  nounPlural: string;           // "PRs" / "MRs"
  identityLabel: string;        // "GitHub login" / "GitLab username"
  identityPlaceholder: string;
  homepageBase: string;         // e.g. "https://github.com/" — concat slug for an external link
};

export const providers: Record<ProviderName, ProviderUiConfig> = {
  github: {
    name: "GitHub",
    Icon: GithubIcon,
    accent: "#24292f",
    brand: "#0969da",
    nounSingular: "PR",
    nounPlural: "PRs",
    identityLabel: "GitHub login",
    identityPlaceholder: "github login (e.g. alice)",
    homepageBase: "https://github.com/",
  },
  gitlab: {
    name: "GitLab",
    Icon: GitlabIcon,
    accent: "#fc6d26",
    brand: "#e24329",
    nounSingular: "MR",
    nounPlural: "MRs",
    identityLabel: "GitLab username",
    identityPlaceholder: "gitlab username (e.g. alice)",
    homepageBase: "https://gitlab.com/",
  },
};

export function providerUi(name: ProviderName): ProviderUiConfig {
  return providers[name];
}
