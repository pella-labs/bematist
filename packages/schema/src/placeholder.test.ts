import { expect, test } from "bun:test";
import { EventSchema, pg } from "./index";

test("EventSchema is exported from package entrypoint", () => {
  expect(EventSchema).toBeDefined();
  expect(typeof EventSchema.parse).toBe("function");
});

test("Postgres Drizzle schema exports orgs/users/developers", () => {
  expect(pg.orgs).toBeDefined();
  expect(pg.users).toBeDefined();
  expect(pg.developers).toBeDefined();
});

test("EventSchema validates a minimal well-formed event", () => {
  const valid = EventSchema.safeParse({
    client_event_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    schema_version: 1,
    ts: "2026-04-16T12:00:00.000Z",
    tenant_id: "org_abc",
    engineer_id: "eng_hash_xyz",
    device_id: "device_1",
    source: "claude-code",
    fidelity: "full",
    tier: "B",
    session_id: "sess_1",
    event_seq: 0,
    dev_metrics: {
      event_kind: "llm_request",
    },
  });
  expect(valid.success).toBe(true);
});

test("EventSchema rejects an event with missing client_event_id", () => {
  const invalid = EventSchema.safeParse({
    schema_version: 1,
    ts: "2026-04-16T12:00:00.000Z",
    tenant_id: "org_abc",
    engineer_id: "eng_hash_xyz",
    device_id: "device_1",
    source: "claude-code",
    fidelity: "full",
    tier: "B",
    session_id: "sess_1",
    event_seq: 0,
    dev_metrics: { event_kind: "llm_request" },
  });
  expect(invalid.success).toBe(false);
});
