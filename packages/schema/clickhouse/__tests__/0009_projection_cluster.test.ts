import { afterAll, beforeAll, expect, test } from "bun:test";
import { explainNatural, explainWithProjection, projectionUsed } from "../explain";
import { insertEvents, makeClient, query, resetState } from "./_harness";

const client = makeClient();

beforeAll(async () => {
  await resetState(client);
  await insertEvents(
    client,
    Array.from({ length: 50 }, (_, i) => ({
      client_event_id: `cp000000-${i.toString().padStart(4, "0")}-0000-0000-000000000000`,
      ts: `2026-04-${String(1 + (i % 10)).padStart(2, "0")}T11:${String(i % 60).padStart(2, "0")}:00.000Z`,
      org_id: "org_cluster",
      engineer_id: `eng_${i % 5}`,
      session_id: `s_${i % 20}`,
      event_seq: i,
      prompt_cluster_id: i % 3 === 0 ? "c_refactor" : i % 3 === 1 ? "c_bugfix" : "c_feature",
      input_tokens: 100 + i,
    })),
  );
});

afterAll(async () => {
  await client.close();
});

test("cluster_lookup projection is registered on events", async () => {
  const rows = await query<{ name: string; table: string }>(
    client,
    `SELECT name, table FROM system.projection_parts WHERE database = 'bematist' AND table = 'events' AND name = 'cluster_lookup' LIMIT 1`,
  );
  expect(rows.length).toBeGreaterThan(0);
});

test("cluster-drill query uses A projection (force_optimize_projection=1 succeeds)", async () => {
  // CH's optimizer may pick either repo_lookup or cluster_lookup since both
  // start with org_id. The gate is: SOME projection gets selected, not a full scan.
  // force_optimize_projection=1 errors if no projection applies.
  const explain = await explainWithProjection(
    client,
    `SELECT sum(input_tokens) FROM events WHERE org_id = 'org_cluster' AND prompt_cluster_id = 'c_refactor'`,
  );
  expect(projectionUsed(explain)).not.toBeNull();
});

test("time-range-only query does NOT use cluster_lookup projection (natural optimizer)", async () => {
  const explain = await explainNatural(
    client,
    `SELECT sum(input_tokens) FROM events WHERE org_id = 'org_cluster' AND ts >= '2026-04-01 00:00:00'`,
  );
  expect(projectionUsed(explain)).not.toBe("cluster_lookup");
});
