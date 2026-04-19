import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  buildJsonlIndex,
  type ClickHouseLike,
  type MutationIdSink,
  noopEmitter,
  readCwdFromJsonl,
  type RecomputeEmitter,
  resolveHeadSha,
  runBackfill,
} from "./backfill-commit-sha";

function tmp() {
  return mkdtempSync(join(tmpdir(), "bematist-backfill-"));
}

describe("buildJsonlIndex", () => {
  test("indexes session_id -> jsonl path across nested project dirs", async () => {
    const root = tmp();
    const p1 = join(root, "proj-a");
    const p2 = join(root, "proj-b", "nested");
    mkdirSync(p1, { recursive: true });
    mkdirSync(p2, { recursive: true });
    writeFileSync(join(p1, "sess-aaa.jsonl"), "");
    writeFileSync(join(p2, "sess-bbb.jsonl"), "");
    writeFileSync(join(p1, "README.md"), "not a session");
    const idx = await buildJsonlIndex(root);
    expect(idx.byId.size).toBe(2);
    expect(idx.byId.get("sess-aaa")).toContain("sess-aaa.jsonl");
    expect(idx.byId.get("sess-bbb")).toContain("sess-bbb.jsonl");
  });

  test("returns empty index for a missing root", async () => {
    const idx = await buildJsonlIndex("/tmp/bematist-no-such-dir-xyzzy");
    expect(idx.byId.size).toBe(0);
  });
});

describe("readCwdFromJsonl", () => {
  test("returns first non-empty cwd from the file", async () => {
    const dir = tmp();
    const p = join(dir, "s.jsonl");
    const lines = [
      JSON.stringify({ type: "header" }),
      JSON.stringify({ type: "user", cwd: "/home/x/project-a" }),
      JSON.stringify({ type: "user", cwd: "/home/x/project-b" }),
    ];
    writeFileSync(p, `${lines.join("\n")}\n`);
    expect(await readCwdFromJsonl(p)).toBe("/home/x/project-a");
  });

  test("skips malformed lines gracefully", async () => {
    const dir = tmp();
    const p = join(dir, "s.jsonl");
    writeFileSync(p, `not json\n${JSON.stringify({ cwd: "/ok" })}\n`);
    expect(await readCwdFromJsonl(p)).toBe("/ok");
  });

  test("returns null when no line carries cwd", async () => {
    const dir = tmp();
    const p = join(dir, "s.jsonl");
    writeFileSync(p, `${JSON.stringify({ type: "user" })}\n`);
    expect(await readCwdFromJsonl(p)).toBeNull();
  });
});

describe("resolveHeadSha", () => {
  test("returns 40-hex head SHA for a real repo", async () => {
    const dir = tmp();
    execSync("git init -q -b main", { cwd: dir });
    execSync('git config user.email "t@t"', { cwd: dir });
    execSync('git config user.name "t"', { cwd: dir });
    writeFileSync(join(dir, "a"), "x");
    execSync("git add .", { cwd: dir });
    execSync('git commit -q -m "x"', { cwd: dir });
    const sha = await resolveHeadSha(dir);
    expect(sha).toMatch(/^[0-9a-f]{40}$/i);
  });

  test("returns null for a non-repo dir", async () => {
    expect(await resolveHeadSha(tmp())).toBeNull();
  });
});

// ---- Orchestration: runBackfill with fake ClickHouse + fake emitter -------

class FakeCh implements ClickHouseLike {
  listRows: Array<{ session_id: string; engineer_id: string }> = [];
  commands: Array<{ query: string; params?: Record<string, unknown> }> = [];
  pendingMutations = 0;

  async query(opts: { query: string; query_params?: Record<string, unknown> }) {
    if (opts.query.includes("system.mutations")) {
      return { json: async () => [{ n: this.pendingMutations }] };
    }
    return { json: async () => this.listRows };
  }

  async command(opts: { query: string; query_params?: Record<string, unknown> }) {
    this.commands.push({ query: opts.query, params: opts.query_params });
  }
}

class FakeEmitter implements RecomputeEmitter {
  sent: Array<{ tenant: string; session: string }> = [];
  async emit(tenant: string, session: string) {
    this.sent.push({ tenant, session });
  }
  async close() {}
}

const passthroughSink: MutationIdSink = { async waitAllDone() {} };

async function seedRepo(): Promise<string> {
  const dir = tmp();
  execSync("git init -q -b main", { cwd: dir });
  execSync('git config user.email "t@t"', { cwd: dir });
  execSync('git config user.name "t"', { cwd: dir });
  writeFileSync(join(dir, "a"), "x");
  execSync("git add .", { cwd: dir });
  execSync('git commit -q -m "x"', { cwd: dir });
  return dir;
}

describe("runBackfill", () => {
  test("resolves commit_sha and issues UPDATEs for sessions with a recoverable cwd", async () => {
    const claudeDir = tmp();
    mkdirSync(join(claudeDir, "proj"), { recursive: true });
    const repo = await seedRepo();
    writeFileSync(
      join(claudeDir, "proj", "sess-1.jsonl"),
      `${JSON.stringify({ cwd: repo })}\n`,
    );

    const ch = new FakeCh();
    ch.listRows = [{ session_id: "sess-1", engineer_id: "eng-a" }];
    const emitter = new FakeEmitter();

    const summary = await runBackfill({
      ch,
      org_id: "org-x",
      claudeDir,
      sink: passthroughSink,
      emitter,
      limit: 100,
      dryRun: false,
      log: () => {},
    });

    expect(summary.resolved).toBe(1);
    expect(summary.batchesApplied).toBe(1);
    expect(ch.commands.length).toBe(1);
    expect(ch.commands[0]?.query).toContain("ALTER TABLE events");
    expect(ch.commands[0]?.params?.sid).toBe("sess-1");
    expect(ch.commands[0]?.params?.eng).toBe("eng-a");
    expect(ch.commands[0]?.params?.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(emitter.sent).toEqual([{ tenant: "org-x", session: "sess-1" }]);
  });

  test("skips sessions whose JSONL is missing", async () => {
    const claudeDir = tmp();
    const ch = new FakeCh();
    ch.listRows = [{ session_id: "sess-gone", engineer_id: "e" }];
    const summary = await runBackfill({
      ch,
      org_id: "org-x",
      claudeDir,
      sink: passthroughSink,
      emitter: noopEmitter(),
      limit: 10,
      dryRun: false,
      log: () => {},
    });
    expect(summary.resolved).toBe(0);
    expect(summary.skippedNoJsonl).toBe(1);
    expect(ch.commands.length).toBe(0);
  });

  test("dry run applies no mutations but counts resolved sessions", async () => {
    const claudeDir = tmp();
    mkdirSync(join(claudeDir, "proj"), { recursive: true });
    const repo = await seedRepo();
    writeFileSync(
      join(claudeDir, "proj", "sess-1.jsonl"),
      `${JSON.stringify({ cwd: repo })}\n`,
    );
    const ch = new FakeCh();
    ch.listRows = [{ session_id: "sess-1", engineer_id: "e" }];
    const emitter = new FakeEmitter();

    const summary = await runBackfill({
      ch,
      org_id: "org-x",
      claudeDir,
      sink: passthroughSink,
      emitter,
      limit: 10,
      dryRun: true,
      log: () => {},
    });

    expect(summary.resolved).toBe(1);
    expect(summary.batchesApplied).toBe(1);
    expect(ch.commands.length).toBe(0);
    expect(emitter.sent.length).toBe(0);
  });
});
