import { afterAll, beforeEach, expect, test } from "bun:test";
import { insertEvents, makeClient, query, resetState } from "./_harness";

const client = makeClient();

beforeEach(async () => {
  await resetState(client);
});

afterAll(async () => {
  await client.close();
});

test("commit_outcome_rollup exists with AggregatingMergeTree inner engine", async () => {
  const rows = await query<{ engine: string }>(
    client,
    `SELECT inner.engine AS engine
     FROM system.tables AS v
     INNER JOIN system.tables AS inner ON ('.inner_id.' || toString(v.uuid)) = inner.name
     WHERE v.database = 'bematist' AND v.name = 'commit_outcome_rollup'`,
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]?.engine).toBe("AggregatingMergeTree");
});

test("events without commit_sha are excluded", async () => {
  await insertEvents(client, [
    {
      client_event_id: "aaaaaaaa-2222-0000-0000-000000000001",
      ts: "2026-04-01T10:00:00.000Z",
      org_id: "org_c",
      engineer_id: "eng_1",
      session_id: "s1",
      event_seq: 0,
      cost_usd: 1.5,
      repo_id_hash: "repo_x",
      commit_sha: "deadbeef0000000000000000000000000000dead",
    },
    {
      client_event_id: "aaaaaaaa-2222-0000-0000-000000000002",
      ts: "2026-04-01T10:00:01.000Z",
      org_id: "org_c",
      engineer_id: "eng_1",
      session_id: "s1",
      event_seq: 1,
      cost_usd: 3.0,
      repo_id_hash: "repo_x",
      commit_sha: null,
    },
  ]);
  const out = await query<{ cost: number }>(
    client,
    `SELECT sumMerge(cost_usd_attributed_state) AS cost
     FROM commit_outcome_rollup WHERE org_id = 'org_c'`,
  );
  expect(Number(out[0]?.cost)).toBe(1.5);
});

test("author_engineer_id_hash is the 8-char cityHash64 hex of engineer_id", async () => {
  await insertEvents(client, [
    {
      client_event_id: "bbbbbbbb-2222-0000-0000-000000000001",
      ts: "2026-04-01T10:00:00.000Z",
      org_id: "org_c",
      engineer_id: "eng_author_1",
      session_id: "s1",
      event_seq: 0,
      repo_id_hash: "repo_x",
      commit_sha: "1111111111111111111111111111111111111111",
    },
  ]);
  const expected = await query<{ h: string }>(
    client,
    `SELECT substring(lower(hex(cityHash64('eng_author_1'))), 1, 8) AS h`,
  );
  const actual = await query<{ author_engineer_id_hash: string }>(
    client,
    `SELECT author_engineer_id_hash FROM commit_outcome_rollup
     WHERE org_id = 'org_c' LIMIT 1`,
  );
  expect(actual[0]?.author_engineer_id_hash).toBe(expected[0]?.h);
  expect(actual[0]?.author_engineer_id_hash.length).toBe(8);
});

test("pr_number_any_state surfaces the associated PR through anyMerge", async () => {
  await insertEvents(client, [
    {
      client_event_id: "cccccccc-2222-0000-0000-000000000001",
      ts: "2026-04-01T10:00:00.000Z",
      org_id: "org_c",
      engineer_id: "eng_1",
      session_id: "s1",
      event_seq: 0,
      repo_id_hash: "repo_x",
      commit_sha: "feedface000000000000000000000000000000ab",
      pr_number: 321,
    },
    {
      client_event_id: "cccccccc-2222-0000-0000-000000000002",
      ts: "2026-04-01T10:00:01.000Z",
      org_id: "org_c",
      engineer_id: "eng_1",
      session_id: "s1",
      event_seq: 1,
      repo_id_hash: "repo_x",
      commit_sha: "feedface000000000000000000000000000000ab",
      pr_number: 321,
    },
  ]);
  const out = await query<{ pr_number: number }>(
    client,
    `SELECT toUInt32(anyMerge(pr_number_any_state)) AS pr_number
     FROM commit_outcome_rollup
     WHERE org_id = 'org_c'
       AND commit_sha = 'feedface000000000000000000000000000000ab'`,
  );
  expect(Number(out[0]?.pr_number)).toBe(321);
});

test("ai_assisted_flag_state trips per (commit, author) when an accept event lands", async () => {
  await insertEvents(client, [
    {
      client_event_id: "dddddddd-2222-0000-0000-000000000001",
      ts: "2026-04-01T10:00:00.000Z",
      org_id: "org_c",
      engineer_id: "eng_a",
      session_id: "s1",
      event_seq: 0,
      repo_id_hash: "repo_x",
      commit_sha: "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
      event_kind: "llm_request",
    },
    {
      client_event_id: "dddddddd-2222-0000-0000-000000000002",
      ts: "2026-04-01T10:00:01.000Z",
      org_id: "org_c",
      engineer_id: "eng_a",
      session_id: "s1",
      event_seq: 1,
      repo_id_hash: "repo_x",
      commit_sha: "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
      event_kind: "code_edit_decision",
      edit_decision: "accept",
    },
    {
      client_event_id: "dddddddd-2222-0000-0000-000000000003",
      ts: "2026-04-01T10:00:02.000Z",
      org_id: "org_c",
      engineer_id: "eng_b",
      session_id: "s2",
      event_seq: 0,
      repo_id_hash: "repo_x",
      commit_sha: "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
      event_kind: "llm_request",
    },
  ]);
  const out = await query<{ commit_sha: string; ai_assisted: number }>(
    client,
    `SELECT commit_sha, toUInt8(maxMerge(ai_assisted_flag_state)) AS ai_assisted
     FROM commit_outcome_rollup
     WHERE org_id = 'org_c'
     GROUP BY commit_sha
     ORDER BY commit_sha`,
  );
  expect(out).toHaveLength(2);
  expect(out[0]?.ai_assisted).toBe(1);
  expect(out[1]?.ai_assisted).toBe(0);
});

test("partition drop on commit_outcome_rollup removes only the targeted month", async () => {
  await insertEvents(client, [
    {
      client_event_id: "f0f0f0f0-2222-0000-0000-000000000001",
      ts: "2026-03-15T10:00:00.000Z",
      org_id: "org_c_drop",
      engineer_id: "eng_1",
      session_id: "s_mar",
      event_seq: 0,
      repo_id_hash: "repo_x",
      commit_sha: "ma77ccbbdd7788990000000000000000000000ee",
    },
    {
      client_event_id: "f0f0f0f0-2222-0000-0000-000000000002",
      ts: "2026-04-15T10:00:00.000Z",
      org_id: "org_c_drop",
      engineer_id: "eng_1",
      session_id: "s_apr",
      event_seq: 0,
      repo_id_hash: "repo_x",
      commit_sha: "ab77ccbbdd7788990000000000000000000000ff",
    },
  ]);
  const before = await query<{ c: number }>(
    client,
    `SELECT count() AS c FROM commit_outcome_rollup WHERE org_id = 'org_c_drop'`,
  );
  expect(Number(before[0]?.c)).toBe(2);
  await client.command({ query: `ALTER TABLE commit_outcome_rollup DROP PARTITION 202603` });
  const after = await query<{ c: number }>(
    client,
    `SELECT count() AS c FROM commit_outcome_rollup WHERE org_id = 'org_c_drop'`,
  );
  expect(Number(after[0]?.c)).toBe(1);
});
