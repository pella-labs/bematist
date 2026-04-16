import { describe, expect, test } from "bun:test";
import type { Event } from "@bematist/schema";
import { handle } from "./server";

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    client_event_id: crypto.randomUUID(),
    schema_version: 1,
    ts: "2026-04-16T12:00:00.000Z",
    tenant_id: "org_abc",
    engineer_id: "eng_hash_xyz",
    device_id: "device_1",
    source: "claude-code",
    fidelity: "full",
    cost_estimated: false,
    tier: "B",
    session_id: "sess_1",
    event_seq: 0,
    dev_metrics: { event_kind: "llm_request" },
    ...overrides,
  };
}

function postEvents(body: unknown, auth = "Bearer dm_test_abc"): Promise<Response> {
  return handle(
    new Request("http://localhost/v1/events", {
      method: "POST",
      headers: auth
        ? { "content-type": "application/json", authorization: auth }
        : { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("ingest server", () => {
  test("GET /healthz returns 200 ok", async () => {
    const res = await handle(new Request("http://localhost/healthz"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("GET /v1/events returns 405 (wrong method)", async () => {
    const res = await handle(new Request("http://localhost/v1/events"));
    expect(res.status).toBe(405);
  });

  test("unknown route returns 404", async () => {
    const res = await handle(new Request("http://localhost/nope"));
    expect(res.status).toBe(404);
  });

  test("POST /v1/events without Authorization returns 401", async () => {
    const res = await handle(
      new Request("http://localhost/v1/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: [makeEvent()] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("POST /v1/events with malformed Authorization returns 401", async () => {
    const res = await postEvents({ events: [makeEvent()] }, "Basic xxx");
    expect(res.status).toBe(401);
  });

  test("POST /v1/events with valid Bearer + valid event → 202 { accepted: 1 }", async () => {
    const res = await postEvents({ events: [makeEvent()] });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { accepted: number; deduped: number; request_id: string };
    expect(body.accepted).toBe(1);
    expect(body.deduped).toBe(0);
    expect(typeof body.request_id).toBe("string");
    expect(body.request_id.length).toBeGreaterThan(0);
  });

  test("POST /v1/events with malformed event (missing client_event_id) → 400", async () => {
    const { client_event_id: _omit, ...ev } = makeEvent();
    const res = await postEvents({ events: [ev] });
    // All-invalid batch → 400 per contract 02 §Response codes.
    expect(res.status).toBe(400);
  });

  test("POST /v1/events with partial-invalid batch → 207", async () => {
    const good = makeEvent();
    const { client_event_id: _omit, ...bad } = makeEvent();
    const res = await postEvents({ events: [good, bad] });
    expect(res.status).toBe(207);
    const body = (await res.json()) as { accepted: number; rejected: unknown[] };
    expect(body.accepted).toBe(1);
    expect(body.rejected.length).toBe(1);
  });

  test("POST /v1/events with invalid JSON → 400", async () => {
    const res = await postEvents("{not json", "Bearer dm_test_abc");
    expect(res.status).toBe(400);
  });

  test("POST /v1/events without events array → 400", async () => {
    const res = await postEvents({ foo: "bar" });
    expect(res.status).toBe(400);
  });

  test("POST /v1/events with >1000 events → 413", async () => {
    const events = Array.from({ length: 1001 }, () => makeEvent());
    const res = await postEvents({ events });
    expect(res.status).toBe(413);
  });
});
