import { afterAll, beforeEach, expect, test } from "bun:test";
import { insertEvents, makeClient, query, resetState } from "./_harness";

const client = makeClient();

beforeEach(async () => {
  await resetState(client);
});

afterAll(async () => {
  await client.close();
});

test("pr_outcome_rollup exists with AggregatingMergeTree inner engine", async () => {
  const rows = await query<{ engine: string }>(
    client,
    `SELECT inner.engine AS engine
     FROM system.tables AS v
     INNER JOIN system.tables AS inner ON ('.inner_id.' || toString(v.uuid)) = inner.name
     WHERE v.database = 'bematist' AND v.name = 'pr_outcome_rollup'`,
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]?.engine).toBe("AggregatingMergeTree");
});

test("events with NULL pr_number are excluded", async () => {
  await insertEvents(client, [
    {
      client_event_id: "aaaaaaaa-1111-0000-0000-000000000001",
      ts: "2026-04-01T10:00:00.000Z",
      org_id: "org_pr",
      engineer_id: "eng_1",
      session_id: "s1",
      event_seq: 0,
      cost_usd: 1.5,
      repo_id_hash: "repo_x",
      pr_number: 42,
    },
    {
      client_event_id: "aaaaaaaa-1111-0000-0000-000000000002",
      ts: "2026-04-01T10:00:01.000Z",
      org_id: "org_pr",
      engineer_id: "eng_1",
      session_id: "s1",
      event_seq: 1,
      cost_usd: 2.5,
      repo_id_hash: "repo_x",
      pr_number: null,
    },
  ]);
  const out = await query<{ cost: number }>(
    client,
    `SELECT sumMerge(cost_usd_state) AS cost FROM pr_outcome_rollup WHERE org_id = 'org_pr'`,
  );
  expect(Number(out[0]?.cost)).toBe(1.5);
});

test("accepted_edit_count_state counts only accept events with hunk_sha256", async () => {
  await insertEvents(client, [
    {
      client_event_id: "bbbbbbbb-1111-0000-0000-000000000001",
      ts: "2026-04-01T10:00:00.000Z",
      org_id: "org_pr",
      engineer_id: "eng_1",
      session_id: "s1",
      event_seq: 0,
      repo_id_hash: "repo_x",
      pr_number: 42,
      event_kind: "code_edit_decision",
      edit_decision: "accept",
    },
    {
      client_event_id: "bbbbbbbb-1111-0000-0000-000000000002",
      ts: "2026-04-01T10:00:01.000Z",
      org_id: "org_pr",
      engineer_id: "eng_1",
      session_id: "s1",
      event_seq: 1,
      repo_id_hash: "repo_x",
      pr_number: 42,
      event_kind: "code_edit_decision",
      edit_decision: "reject",
    },
  ]);
  // The canonical _harness leaves hunk_sha256 null. The accept event therefore
  // doesn't trip accepted_edit_count_state (which requires hunk_sha256 IS NOT
  // NULL). Insert a row with an explicit hunk to verify the count rises.
  await client.insert({
    table: "events",
    values: [
      {
        client_event_id: "bbbbbbbb-1111-0000-0000-000000000003",
        schema_version: 1,
        ts: "2026-04-01 10:00:02.000",
        org_id: "org_pr",
        engineer_id: "eng_1",
        device_id: "test-device",
        source: "claude-code",
        source_version: "1.0.0",
        fidelity: "full",
        cost_estimated: 0,
        tier: "B",
        session_id: "s1",
        event_seq: 2,
        parent_session_id: null,
        gen_ai_system: "anthropic",
        gen_ai_request_model: "claude-opus-4-7",
        gen_ai_response_model: "claude-opus-4-7",
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        event_kind: "code_edit_decision",
        cost_usd: 0,
        pricing_version: "v1",
        duration_ms: 0,
        tool_name: "",
        tool_status: "",
        hunk_sha256: "deadbeef".repeat(4),
        file_path_hash: null,
        edit_decision: "accept",
        revert_within_24h: 0,
        first_try_failure: null,
        prompt_text: null,
        tool_input: null,
        tool_output: null,
        prompt_abstract: null,
        prompt_embedding: [],
        prompt_index: 0,
        redaction_count: 0,
        pr_number: 42,
        commit_sha: null,
        branch: null,
        raw_attrs: "{}",
        repo_id_hash: "repo_x",
        prompt_cluster_id: null,
      },
    ],
    format: "JSONEachRow",
  });
  const out = await query<{ accepted: number }>(
    client,
    `SELECT countIfMerge(accepted_edit_count_state) AS accepted FROM pr_outcome_rollup WHERE org_id = 'org_pr'`,
  );
  expect(Number(out[0]?.accepted)).toBe(1);
});

test("ai_assisted_flag_state trips when at least one accept event lands on the PR", async () => {
  await insertEvents(client, [
    {
      client_event_id: "cccccccc-1111-0000-0000-000000000001",
      ts: "2026-04-01T10:00:00.000Z",
      org_id: "org_pr",
      engineer_id: "eng_1",
      session_id: "s1",
      event_seq: 0,
      repo_id_hash: "repo_x",
      pr_number: 100,
      event_kind: "llm_request",
    },
    {
      client_event_id: "cccccccc-1111-0000-0000-000000000002",
      ts: "2026-04-01T10:00:01.000Z",
      org_id: "org_pr",
      engineer_id: "eng_1",
      session_id: "s1",
      event_seq: 1,
      repo_id_hash: "repo_x",
      pr_number: 100,
      event_kind: "code_edit_decision",
      edit_decision: "accept",
    },
    // Separate PR that never gets an accept — ai_assisted_flag_state stays 0.
    {
      client_event_id: "cccccccc-1111-0000-0000-000000000003",
      ts: "2026-04-01T10:00:02.000Z",
      org_id: "org_pr",
      engineer_id: "eng_1",
      session_id: "s2",
      event_seq: 0,
      repo_id_hash: "repo_x",
      pr_number: 200,
      event_kind: "llm_request",
    },
  ]);
  const out = await query<{ pr_number: number; ai_assisted: number }>(
    client,
    `SELECT pr_number, toUInt8(maxMerge(ai_assisted_flag_state)) AS ai_assisted
     FROM pr_outcome_rollup
     WHERE org_id = 'org_pr'
     GROUP BY pr_number
     ORDER BY pr_number`,
  );
  expect(out).toHaveLength(2);
  expect(out[0]).toEqual({ pr_number: 100, ai_assisted: 1 });
  expect(out[1]).toEqual({ pr_number: 200, ai_assisted: 0 });
});

test("revert_count_state sums revert_within_24h per PR", async () => {
  await insertEvents(client, [
    {
      client_event_id: "dddddddd-1111-0000-0000-000000000001",
      ts: "2026-04-01T10:00:00.000Z",
      org_id: "org_pr",
      engineer_id: "eng_1",
      session_id: "s1",
      event_seq: 0,
      repo_id_hash: "repo_x",
      pr_number: 7,
      event_kind: "code_edit_decision",
      edit_decision: "accept",
      revert_within_24h: 1,
    },
    {
      client_event_id: "dddddddd-1111-0000-0000-000000000002",
      ts: "2026-04-01T10:00:01.000Z",
      org_id: "org_pr",
      engineer_id: "eng_1",
      session_id: "s1",
      event_seq: 1,
      repo_id_hash: "repo_x",
      pr_number: 7,
      event_kind: "code_edit_decision",
      edit_decision: "accept",
      revert_within_24h: 1,
    },
    {
      client_event_id: "dddddddd-1111-0000-0000-000000000003",
      ts: "2026-04-01T10:00:02.000Z",
      org_id: "org_pr",
      engineer_id: "eng_1",
      session_id: "s1",
      event_seq: 2,
      repo_id_hash: "repo_x",
      pr_number: 7,
      event_kind: "code_edit_decision",
      edit_decision: "accept",
      revert_within_24h: 0,
    },
  ]);
  const out = await query<{ reverted: number }>(
    client,
    `SELECT toUInt64(sumMerge(revert_count_state)) AS reverted
     FROM pr_outcome_rollup WHERE org_id = 'org_pr'`,
  );
  expect(Number(out[0]?.reverted)).toBe(2);
});

test("contributors_state counts distinct engineers per PR", async () => {
  await insertEvents(client, [
    {
      client_event_id: "eeeeeeee-1111-0000-0000-000000000001",
      ts: "2026-04-01T10:00:00.000Z",
      org_id: "org_pr",
      engineer_id: "eng_a",
      session_id: "s1",
      event_seq: 0,
      repo_id_hash: "repo_x",
      pr_number: 55,
    },
    {
      client_event_id: "eeeeeeee-1111-0000-0000-000000000002",
      ts: "2026-04-01T10:00:01.000Z",
      org_id: "org_pr",
      engineer_id: "eng_a",
      session_id: "s1",
      event_seq: 1,
      repo_id_hash: "repo_x",
      pr_number: 55,
    },
    {
      client_event_id: "eeeeeeee-1111-0000-0000-000000000003",
      ts: "2026-04-01T10:00:02.000Z",
      org_id: "org_pr",
      engineer_id: "eng_b",
      session_id: "s2",
      event_seq: 0,
      repo_id_hash: "repo_x",
      pr_number: 55,
    },
  ]);
  const out = await query<{ contributors: number }>(
    client,
    `SELECT toUInt32(uniqMerge(contributors_state)) AS contributors
     FROM pr_outcome_rollup WHERE org_id = 'org_pr'`,
  );
  expect(Number(out[0]?.contributors)).toBe(2);
});

test("duration_ms_p95_state folds across day-split rows", async () => {
  await insertEvents(client, [
    {
      client_event_id: "eeeeeeee-1212-0000-0000-000000000001",
      ts: "2026-04-01T23:59:00.000Z",
      org_id: "org_pr",
      engineer_id: "eng_1",
      session_id: "s1",
      event_seq: 0,
      repo_id_hash: "repo_x",
      pr_number: 77,
      duration_ms: 1000,
    },
    {
      client_event_id: "eeeeeeee-1212-0000-0000-000000000002",
      ts: "2026-04-02T00:01:00.000Z",
      org_id: "org_pr",
      engineer_id: "eng_1",
      session_id: "s1",
      event_seq: 1,
      repo_id_hash: "repo_x",
      pr_number: 77,
      duration_ms: 9000,
    },
  ]);
  // Two rows exist in the MV (one per UTC day); *Merge folds them.
  const rowCount = await query<{ c: number }>(
    client,
    `SELECT count() AS c FROM pr_outcome_rollup WHERE org_id = 'org_pr' AND pr_number = 77`,
  );
  expect(Number(rowCount[0]?.c)).toBe(2);
  const out = await query<{ p95: number }>(
    client,
    `SELECT toUInt64(quantileMerge(0.95)(duration_ms_p95_state)) AS p95
     FROM pr_outcome_rollup WHERE org_id = 'org_pr' AND pr_number = 77`,
  );
  expect(Number(out[0]?.p95)).toBeGreaterThanOrEqual(1000);
  expect(Number(out[0]?.p95)).toBeLessThanOrEqual(9000);
});
