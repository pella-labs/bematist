import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export interface RepoInfo {
  owner: string;
  repo: string;
}

export type RepoCache = Map<string, RepoInfo | null>;

export function makeRepoCache(): RepoCache {
  return new Map();
}

/**
 * Parse a GitHub remote URL → { owner, repo } or null. Handles both
 * https://github.com/foo/bar.git and git@github.com:foo/bar.git.
 */
export function parseGithubRemote(url: string): RepoInfo | null {
  const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

/**
 * Resolve a working-directory path to the GitHub owner/repo pair via
 * `git remote get-url origin`. Returns null for cwds that aren't under a
 * git repo, or whose origin isn't a github.com remote. Results are
 * memoized into `cache` so repeated lookups are free.
 *
 * Strips Claude Code's per-session agent worktree segments before walking
 * up — those are scratch copies of the real repo and share its origin.
 */
export function resolveRepo(cwd: string, cache: RepoCache): RepoInfo | null {
  if (!cwd) return null;
  if (cache.has(cwd)) return cache.get(cwd) ?? null;
  const trimmed = cwd.replace(/\/\.claude\/worktrees\/agent-[^/]+.*$/, "");
  let cur = trimmed;
  let root: string | null = null;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(cur, ".git"))) {
      root = cur;
      break;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  if (!root) {
    cache.set(cwd, null);
    return null;
  }
  try {
    const url = execSync(`git -C "${root}" remote get-url origin`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const info = parseGithubRemote(url);
    cache.set(cwd, info);
    return info;
  } catch {
    cache.set(cwd, null);
    return null;
  }
}
