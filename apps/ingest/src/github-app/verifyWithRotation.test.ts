// Unit tests for the HMAC dual-accept verifier (PRD §11.5, D55).
//
// These tests are pure — no network, no DB. The five rotation scenarios the
// task explicitly calls out (active hit, fallback hit, window expired,
// no previous ref, both mismatch) each land as an independent case.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import type { WebhookDelivery } from "../webhooks/verify";
import type { InstallationRecord } from "./installationResolver";
import { getCounterValue, resetGithubMetrics } from "./metrics";
import { createInMemoryWebhookSecretResolver } from "./secretsResolver";
import { verifyWithRotation } from "./verifyWithRotation";

const ACTIVE_SECRET = "active-secret-bytes";
const PREV_SECRET = "previous-secret-bytes";

function bodyBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function sig(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function makeDelivery(body: string, secret: string): WebhookDelivery {
  return {
    source: "github",
    deliveryId: "d-1",
    event: "pull_request",
    rawBody: bodyBytes(body),
    signature: sig(body, secret),
  };
}

function makeInstallation(overrides: Partial<InstallationRecord> = {}): InstallationRecord {
  return {
    tenant_id: "00000000-0000-0000-0000-000000000001",
    installation_id: 42424242n,
    github_org_id: 123456n,
    github_org_login: "fixture-org",
    app_id: 909090n,
    status: "active",
    token_ref: "tok:test",
    webhook_secret_active_ref: "ws:active",
    webhook_secret_previous_ref: null,
    webhook_secret_rotated_at: null,
    ...overrides,
  };
}

beforeEach(() => resetGithubMetrics());
afterEach(() => resetGithubMetrics());

describe("verifyWithRotation", () => {
  test("valid active signature → ok path=active, no fallback metric", async () => {
    const resolver = createInMemoryWebhookSecretResolver({
      "ws:active": ACTIVE_SECRET,
    });
    const body = '{"action":"opened"}';
    const r = await verifyWithRotation({
      installation: makeInstallation(),
      resolver,
      delivery: makeDelivery(body, ACTIVE_SECRET),
    });
    expect(r).toEqual({ ok: true, path: "active" });
    expect(getCounterValue("github_webhook_signature_fallback_used_total")).toBe(0);
    expect(
      getCounterValue("github_webhook_signature_reject_total", { reason: "both_mismatch" }),
    ).toBe(0);
  });

  test("active mismatch inside window + previous matches → ok path=fallback, fallback metric++", async () => {
    const resolver = createInMemoryWebhookSecretResolver({
      "ws:active": ACTIVE_SECRET,
      "ws:prev": PREV_SECRET,
    });
    const body = '{"action":"opened"}';
    const rotatedAt = new Date("2026-04-18T00:00:00Z");
    const now = new Date("2026-04-18T00:05:00Z"); // 5 min into window
    const r = await verifyWithRotation({
      installation: makeInstallation({
        webhook_secret_previous_ref: "ws:prev",
        webhook_secret_rotated_at: rotatedAt,
      }),
      resolver,
      delivery: makeDelivery(body, PREV_SECRET),
      now: () => now,
    });
    expect(r).toEqual({ ok: true, path: "fallback" });
    expect(getCounterValue("github_webhook_signature_fallback_used_total")).toBe(1);
  });

  test("active mismatch outside 10-min window → reject window_expired + reject metric++", async () => {
    const resolver = createInMemoryWebhookSecretResolver({
      "ws:active": ACTIVE_SECRET,
      "ws:prev": PREV_SECRET,
    });
    const body = '{"action":"opened"}';
    const rotatedAt = new Date("2026-04-18T00:00:00Z");
    const now = new Date("2026-04-18T00:11:00Z"); // 11 min (past 10)
    const r = await verifyWithRotation({
      installation: makeInstallation({
        webhook_secret_previous_ref: "ws:prev",
        webhook_secret_rotated_at: rotatedAt,
      }),
      resolver,
      delivery: makeDelivery(body, PREV_SECRET),
      now: () => now,
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("active_mismatch_window_expired");
    expect(
      getCounterValue("github_webhook_signature_reject_total", {
        reason: "active_mismatch_window_expired",
      }),
    ).toBe(1);
  });

  test("active mismatch with no previous_ref → reject no_previous_ref", async () => {
    const resolver = createInMemoryWebhookSecretResolver({ "ws:active": ACTIVE_SECRET });
    const body = '{"action":"opened"}';
    const r = await verifyWithRotation({
      installation: makeInstallation(),
      resolver,
      delivery: makeDelivery(body, PREV_SECRET),
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("active_mismatch_no_previous_ref");
  });

  test("active resolves but secret absent from store → reject no_active_secret", async () => {
    const resolver = createInMemoryWebhookSecretResolver({});
    const body = '{"action":"opened"}';
    const r = await verifyWithRotation({
      installation: makeInstallation(),
      resolver,
      delivery: makeDelivery(body, ACTIVE_SECRET),
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("no_active_secret");
  });

  test("active mismatch + previous mismatch in window → reject both_mismatch", async () => {
    const resolver = createInMemoryWebhookSecretResolver({
      "ws:active": ACTIVE_SECRET,
      "ws:prev": PREV_SECRET,
    });
    const body = '{"action":"opened"}';
    const rotatedAt = new Date("2026-04-18T00:00:00Z");
    const now = new Date("2026-04-18T00:05:00Z");
    const r = await verifyWithRotation({
      installation: makeInstallation({
        webhook_secret_previous_ref: "ws:prev",
        webhook_secret_rotated_at: rotatedAt,
      }),
      resolver,
      delivery: makeDelivery(body, "totally-wrong-secret"),
      now: () => now,
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("both_mismatch");
    expect(
      getCounterValue("github_webhook_signature_reject_total", { reason: "both_mismatch" }),
    ).toBe(1);
  });
});
