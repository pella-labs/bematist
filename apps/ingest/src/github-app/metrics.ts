// Prometheus-shaped metrics for the GitHub webhook pipeline (PRD §11.8).
//
// We do NOT add a prom-client dep. Instead, we expose a tiny in-process
// registry that:
//   • tracks counter / histogram / gauge samples by name + label set,
//   • can render the standard Prometheus text-exposition format,
//   • logs every sample as structured JSON via the existing pino logger.
//
// This keeps the "no new npm deps without justification" rule (CLAUDE.md
// §Tech Stack) honored while still delivering the §11.8 metric list. When
// the ingest server gains a real Prometheus exporter (Phase 2), we swap
// the registry for prom-client without touching the call-sites.
//
// The registry is module-level (one per process) so emitters in ingest and
// worker-bridge code share a single view. Tests reset between cases via
// `resetGithubMetrics()`.

import { logger } from "../logger";

type LabelSet = Readonly<Record<string, string | number>>;

function labelsKey(labels: LabelSet): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}=${String(labels[k])}`).join(",");
}

function renderLabels(labels: LabelSet): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  const parts = keys.map((k) => `${k}="${String(labels[k]).replace(/"/g, '\\"')}"`);
  return `{${parts.join(",")}}`;
}

interface CounterState {
  help: string;
  values: Map<string, { labels: LabelSet; value: number }>;
}

interface GaugeState {
  help: string;
  values: Map<string, { labels: LabelSet; value: number }>;
}

/** Fixed bucket set matching webhook-lag p95/p99 observability. In seconds. */
export const WEBHOOK_LAG_BUCKETS: readonly number[] = [
  0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
];

interface HistogramState {
  help: string;
  buckets: readonly number[];
  /** Per-label-set observation counts for each bucket + running total. */
  series: Map<
    string,
    {
      labels: LabelSet;
      bucketCounts: number[];
      sum: number;
      count: number;
    }
  >;
}

const counters = new Map<string, CounterState>();
const gauges = new Map<string, GaugeState>();
const histograms = new Map<string, HistogramState>();

// ---- Counter --------------------------------------------------------------

export function defineCounter(name: string, help: string): void {
  if (!counters.has(name)) counters.set(name, { help, values: new Map() });
}

export function incrCounter(name: string, labels: LabelSet = {}, delta = 1): void {
  const state = counters.get(name);
  if (!state) throw new Error(`metric:unknown-counter:${name}`);
  const key = labelsKey(labels);
  const entry = state.values.get(key);
  if (entry) entry.value += delta;
  else state.values.set(key, { labels: { ...labels }, value: delta });
  logger.debug({ metric: name, kind: "counter", labels, delta }, "metric.inc");
}

// ---- Gauge ----------------------------------------------------------------

export function defineGauge(name: string, help: string): void {
  if (!gauges.has(name)) gauges.set(name, { help, values: new Map() });
}

export function setGauge(name: string, labels: LabelSet, value: number): void {
  const state = gauges.get(name);
  if (!state) throw new Error(`metric:unknown-gauge:${name}`);
  const key = labelsKey(labels);
  state.values.set(key, { labels: { ...labels }, value });
  logger.debug({ metric: name, kind: "gauge", labels, value }, "metric.set");
}

// ---- Histogram ------------------------------------------------------------

export function defineHistogram(
  name: string,
  help: string,
  buckets: readonly number[] = WEBHOOK_LAG_BUCKETS,
): void {
  if (!histograms.has(name)) histograms.set(name, { help, buckets, series: new Map() });
}

export function observeHistogram(name: string, labels: LabelSet, value: number): void {
  const state = histograms.get(name);
  if (!state) throw new Error(`metric:unknown-histogram:${name}`);
  const key = labelsKey(labels);
  let entry = state.series.get(key);
  if (!entry) {
    entry = {
      labels: { ...labels },
      bucketCounts: new Array(state.buckets.length).fill(0),
      sum: 0,
      count: 0,
    };
    state.series.set(key, entry);
  }
  entry.count += 1;
  entry.sum += value;
  for (let i = 0; i < state.buckets.length; i++) {
    const b = state.buckets[i];
    if (b !== undefined && value <= b) entry.bucketCounts[i] = (entry.bucketCounts[i] ?? 0) + 1;
  }
  logger.debug({ metric: name, kind: "histogram", labels, value }, "metric.observe");
}

// ---- Inspection helpers (tests + /metrics renderer) ----------------------

export function getCounterValue(name: string, labels: LabelSet = {}): number {
  const state = counters.get(name);
  if (!state) return 0;
  return state.values.get(labelsKey(labels))?.value ?? 0;
}

export function getGaugeValue(name: string, labels: LabelSet = {}): number | undefined {
  const state = gauges.get(name);
  if (!state) return undefined;
  return state.values.get(labelsKey(labels))?.value;
}

export function getHistogramCount(name: string, labels: LabelSet = {}): number {
  const state = histograms.get(name);
  if (!state) return 0;
  return state.series.get(labelsKey(labels))?.count ?? 0;
}

export function renderPrometheus(): string {
  const lines: string[] = [];
  for (const [name, state] of counters) {
    lines.push(`# HELP ${name} ${state.help}`);
    lines.push(`# TYPE ${name} counter`);
    for (const v of state.values.values()) {
      lines.push(`${name}${renderLabels(v.labels)} ${v.value}`);
    }
  }
  for (const [name, state] of gauges) {
    lines.push(`# HELP ${name} ${state.help}`);
    lines.push(`# TYPE ${name} gauge`);
    for (const v of state.values.values()) {
      lines.push(`${name}${renderLabels(v.labels)} ${v.value}`);
    }
  }
  for (const [name, state] of histograms) {
    lines.push(`# HELP ${name} ${state.help}`);
    lines.push(`# TYPE ${name} histogram`);
    for (const s of state.series.values()) {
      for (let i = 0; i < state.buckets.length; i++) {
        const le = state.buckets[i];
        if (le === undefined) continue;
        const labelsWithLe = { ...s.labels, le: String(le) };
        lines.push(`${name}_bucket${renderLabels(labelsWithLe)} ${s.bucketCounts[i] ?? 0}`);
      }
      const labelsWithInf = { ...s.labels, le: "+Inf" };
      lines.push(`${name}_bucket${renderLabels(labelsWithInf)} ${s.count}`);
      lines.push(`${name}_sum${renderLabels(s.labels)} ${s.sum}`);
      lines.push(`${name}_count${renderLabels(s.labels)} ${s.count}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function resetGithubMetrics(): void {
  for (const c of counters.values()) c.values.clear();
  for (const g of gauges.values()) g.values.clear();
  for (const h of histograms.values()) h.series.clear();
}

// ---- Definitions (PRD §11.8) ---------------------------------------------

defineHistogram(
  "github_webhook_lag_seconds",
  "Elapsed seconds between GitHub event generation and ingest 200-OK, per tenant/event_type.",
);
defineCounter(
  "github_webhook_signature_fallback_used_total",
  "HMAC verified against webhook_secret_previous_ref during the 10-min rotation window (D55).",
);
defineCounter(
  "github_webhook_signature_reject_total",
  "Webhook rejected with HTTP 401 due to signature failure, labeled with reason.",
);
defineCounter(
  "github_webhook_redelivery_requests_total",
  "Webhook delivery failed with a status that GitHub will redeliver, labeled with reason.",
);
defineGauge(
  "github_api_rate_limit_remaining",
  "Latest X-RateLimit-Remaining observed per installation; owned by G1-admin-sync's REST client.",
);
