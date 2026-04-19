import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Expand a leading `~/` to the user's home directory. Node's fs APIs
 * don't do this for us, so an env var like `BEMATIST_DATA_DIR=~/.bematist`
 * (set with shell quoting that prevented tilde expansion at assignment)
 * flows through as a literal `~/...` path and every `mkdirSync` /
 * `readFileSync` call then ENOENTs silently. Expand defensively wherever
 * we read a filesystem path from env.
 */
function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

export function dataDir(): string {
  const raw = process.env.BEMATIST_DATA_DIR;
  return raw ? expandTilde(raw) : join(homedir(), ".bematist");
}

export function egressSqlite(): string {
  return join(dataDir(), "egress.sqlite");
}

export function policyPath(): string {
  const raw = process.env.BEMATIST_POLICY_PATH;
  return raw ? expandTilde(raw) : join(dataDir(), "policy.yaml");
}

export function configEnvPath(): string {
  const raw = process.env.BEMATIST_CONFIG_ENV_PATH;
  return raw ? expandTilde(raw) : join(dataDir(), "config.env");
}

export function claudeProjectsDir(): string {
  const raw = process.env.CLAUDE_CONFIG_DIR;
  const base = raw ? expandTilde(raw) : join(homedir(), ".claude");
  return join(base, "projects");
}
