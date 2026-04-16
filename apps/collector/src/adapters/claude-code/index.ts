import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Event } from "@bematist/schema";
import type { Adapter, AdapterContext, AdapterHealth } from "@bematist/sdk";

// Scaffold only. Real JSONL parser + OTel receiver wiring lands in Sprint 1 (Workstream B).
// Source of truth for adapter shape: contracts/03-adapter-sdk.md.
// Source of truth for adapter matrix (fidelity "full"): CLAUDE.md §"Adapter Matrix".

interface DiscoverySources {
  otelEnabled: boolean;
  jsonlDir: string;
  jsonlDirExists: boolean;
}

function discoverSources(): DiscoverySources {
  // OTel path: set by the dev when they want native telemetry (CLAUDE.md §Adapter Matrix).
  const otelEnabled = process.env.CLAUDE_CODE_ENABLE_TELEMETRY === "1";
  // JSONL backfill path — historical sessions live under ~/.claude/projects/*/sessions/*.jsonl.
  const jsonlDir = join(homedir(), ".claude", "projects");
  return {
    otelEnabled,
    jsonlDir,
    jsonlDirExists: existsSync(jsonlDir),
  };
}

export class ClaudeCodeAdapter implements Adapter {
  readonly id = "claude-code";
  readonly label = "Claude Code";
  readonly version = "0.0.0";
  readonly supportedSourceVersions = ">=1.0.0";

  private sources: DiscoverySources | null = null;

  async init(ctx: AdapterContext): Promise<void> {
    this.sources = discoverSources();
    ctx.log.info("claude-code adapter init", {
      otelEnabled: this.sources.otelEnabled,
      jsonlDirExists: this.sources.jsonlDirExists,
    });
  }

  async poll(_ctx: AdapterContext, _signal: AbortSignal): Promise<Event[]> {
    // Sprint 1+: tail OTel stream OR parse JSONL files under sources.jsonlDir.
    // Each returned event MUST have run through the on-device Clio pipeline
    // (contracts/06-clio-pipeline.md) before emission for Tier B+.
    return [];
  }

  async health(_ctx: AdapterContext): Promise<AdapterHealth> {
    const s = this.sources ?? discoverSources();
    const caveats: string[] = [];
    if (!s.otelEnabled && !s.jsonlDirExists) {
      caveats.push("No OTel env var and no JSONL dir — no Claude Code data will be captured.");
    }
    if (!s.otelEnabled && s.jsonlDirExists) {
      caveats.push("JSONL-backfill mode: enable CLAUDE_CODE_ENABLE_TELEMETRY=1 for live capture.");
    }
    const status = s.otelEnabled || s.jsonlDirExists ? "ok" : "disabled";
    return {
      status,
      fidelity: "full",
      ...(caveats.length > 0 ? { caveats } : {}),
    };
  }
}

export const claudeCodeAdapter = new ClaudeCodeAdapter();
