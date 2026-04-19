import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getCounterValue,
  getGaugeValue,
  getHistogramCount,
  incrCounter,
  observeHistogram,
  renderPrometheus,
  resetGithubMetrics,
  setGauge,
} from "./metrics";

beforeEach(() => resetGithubMetrics());
afterEach(() => resetGithubMetrics());

describe("metrics registry", () => {
  test("counter increments per label set", () => {
    incrCounter("github_webhook_signature_reject_total", { reason: "both_mismatch" });
    incrCounter("github_webhook_signature_reject_total", { reason: "both_mismatch" });
    incrCounter("github_webhook_signature_reject_total", { reason: "no_active_secret" });
    expect(
      getCounterValue("github_webhook_signature_reject_total", { reason: "both_mismatch" }),
    ).toBe(2);
    expect(
      getCounterValue("github_webhook_signature_reject_total", { reason: "no_active_secret" }),
    ).toBe(1);
  });

  test("gauge last-write-wins", () => {
    setGauge("github_api_rate_limit_remaining", { installation: "42" }, 4800);
    setGauge("github_api_rate_limit_remaining", { installation: "42" }, 4500);
    expect(getGaugeValue("github_api_rate_limit_remaining", { installation: "42" })).toBe(4500);
  });

  test("histogram bucket + sum + count semantics", () => {
    observeHistogram("github_webhook_lag_seconds", { tenant: "T", event_type: "push" }, 0.2);
    observeHistogram("github_webhook_lag_seconds", { tenant: "T", event_type: "push" }, 1.5);
    expect(
      getHistogramCount("github_webhook_lag_seconds", { tenant: "T", event_type: "push" }),
    ).toBe(2);
    const text = renderPrometheus();
    expect(text).toContain("github_webhook_lag_seconds_bucket");
    expect(text).toContain("github_webhook_lag_seconds_sum");
    expect(text).toContain("github_webhook_lag_seconds_count");
    // The 0.5 bucket should have observed only the first sample; the 2.5
    // bucket should have observed both.
    expect(text).toMatch(/github_webhook_lag_seconds_bucket\{[^}]*le="0\.5"[^}]*\} 1/);
    expect(text).toMatch(/github_webhook_lag_seconds_bucket\{[^}]*le="2\.5"[^}]*\} 2/);
  });

  test("renderPrometheus includes # HELP + # TYPE lines for defined metrics", () => {
    const text = renderPrometheus();
    expect(text).toContain("# HELP github_webhook_signature_fallback_used_total");
    expect(text).toContain("# TYPE github_webhook_signature_fallback_used_total counter");
    expect(text).toContain("# TYPE github_webhook_lag_seconds histogram");
    expect(text).toContain("# TYPE github_api_rate_limit_remaining gauge");
  });
});
