// Proto3-JSON decoder for OTLP Export*ServiceRequest payloads.
//
// Validates shape via duck-typing (cheap; full zod would dominate the request
// budget). Throws `OtlpDecodeError` with `code:"OTLP_DECODE"` on malformed
// input — the OTLP HTTP handler maps this to a 400 response.
//
// Proto3-JSON quirks handled:
//   - Keys arrive lowerCamelCase.
//   - traceId/spanId stay as hex strings (never base64-decoded).
//   - Enum fields (span.kind, status.code) arrive as ints; left as numbers.
//   - Int64 (startTimeUnixNano etc.) arrive as either string OR number;
//     normalized to string for nano timestamps and to number for small counts.
//   - Unknown fields are ignored.

import type {
  AnyValue,
  ExportLogsServiceRequest,
  ExportMetricsServiceRequest,
  ExportTraceServiceRequest,
  KeyValue,
  LogRecord,
  Metric,
  NumberDataPoint,
  Resource,
  ResourceLogs,
  ResourceMetrics,
  ResourceSpans,
  ScopeLogs,
  ScopeMetrics,
  ScopeSpans,
  Span,
} from "./types";

export class OtlpDecodeError extends Error {
  code: "OTLP_DECODE" = "OTLP_DECODE";
  constructor(message: string) {
    super(message);
    this.name = "OtlpDecodeError";
  }
}

function assertOrThrow(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new OtlpDecodeError(msg);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function decodeAnyValue(raw: unknown): AnyValue {
  assertOrThrow(isObject(raw), "AnyValue must be an object");
  const out: AnyValue = {};
  if (typeof raw.stringValue === "string") out.stringValue = raw.stringValue;
  if (typeof raw.boolValue === "boolean") out.boolValue = raw.boolValue;
  if (typeof raw.intValue === "string" || typeof raw.intValue === "number") {
    out.intValue = raw.intValue;
  }
  if (typeof raw.doubleValue === "number") out.doubleValue = raw.doubleValue;
  if (typeof raw.bytesValue === "string") out.bytesValue = raw.bytesValue;
  if (isObject(raw.arrayValue) && Array.isArray((raw.arrayValue as { values?: unknown }).values)) {
    out.arrayValue = {
      values: (raw.arrayValue as { values: unknown[] }).values.map(decodeAnyValue),
    };
  }
  if (
    isObject(raw.kvlistValue) &&
    Array.isArray((raw.kvlistValue as { values?: unknown }).values)
  ) {
    out.kvlistValue = {
      values: (raw.kvlistValue as { values: unknown[] }).values.map(decodeKeyValue),
    };
  }
  return out;
}

function decodeKeyValue(raw: unknown): KeyValue {
  assertOrThrow(isObject(raw), "KeyValue must be an object");
  assertOrThrow(typeof raw.key === "string", "KeyValue.key must be a string");
  assertOrThrow("value" in raw, "KeyValue.value missing");
  return { key: raw.key, value: decodeAnyValue(raw.value) };
}

function decodeKeyValueList(raw: unknown): KeyValue[] {
  if (raw === undefined) return [];
  assertOrThrow(Array.isArray(raw), "attributes must be an array");
  return raw.map(decodeKeyValue);
}

function decodeResource(raw: unknown): Resource {
  assertOrThrow(isObject(raw), "Resource must be an object");
  return { attributes: decodeKeyValueList(raw.attributes) };
}

function normalizeNano(raw: unknown): string | number {
  // Big nanos are usually strings in proto3-JSON; pass through unchanged.
  // If a number arrives, coerce to a JS number IF it fits without precision
  // loss in float64 (≤ Number.MAX_SAFE_INTEGER), else stringify.
  if (typeof raw === "string") return raw;
  if (typeof raw === "number") {
    if (Number.isFinite(raw) && Math.abs(raw) <= Number.MAX_SAFE_INTEGER) return raw;
    return String(raw);
  }
  // Missing → "0" (the mapper drops/defaults).
  return "0";
}

function decodeSpan(raw: unknown): Span {
  assertOrThrow(isObject(raw), "Span must be an object");
  assertOrThrow(typeof raw.traceId === "string", "Span.traceId must be a hex string");
  assertOrThrow(typeof raw.spanId === "string", "Span.spanId must be a hex string");
  assertOrThrow(typeof raw.name === "string", "Span.name must be a string");
  const span: Span = {
    traceId: raw.traceId,
    spanId: raw.spanId,
    name: raw.name,
    startTimeUnixNano: normalizeNano(raw.startTimeUnixNano),
    endTimeUnixNano: normalizeNano(raw.endTimeUnixNano),
    attributes: decodeKeyValueList(raw.attributes),
  };
  if (typeof raw.parentSpanId === "string") span.parentSpanId = raw.parentSpanId;
  if (typeof raw.kind === "number") span.kind = raw.kind;
  if (isObject(raw.status)) {
    const s: { code?: number; message?: string } = {};
    if (typeof (raw.status as { code?: unknown }).code === "number") {
      s.code = (raw.status as { code: number }).code;
    }
    if (typeof (raw.status as { message?: unknown }).message === "string") {
      s.message = (raw.status as { message: string }).message;
    }
    span.status = s;
  }
  return span;
}

function decodeScopeSpans(raw: unknown): ScopeSpans {
  assertOrThrow(isObject(raw), "ScopeSpans must be an object");
  const spans = raw.spans;
  assertOrThrow(spans === undefined || Array.isArray(spans), "ScopeSpans.spans must be an array");
  const out: ScopeSpans = {
    spans: spans ? (spans as unknown[]).map(decodeSpan) : [],
  };
  if (isObject(raw.scope)) {
    const sc: { name?: string; version?: string; attributes?: KeyValue[] } = {
      attributes: decodeKeyValueList((raw.scope as { attributes?: unknown }).attributes),
    };
    if (typeof raw.scope.name === "string") sc.name = raw.scope.name;
    if (typeof raw.scope.version === "string") sc.version = raw.scope.version;
    out.scope = sc;
  }
  return out;
}

function decodeResourceSpans(raw: unknown): ResourceSpans {
  assertOrThrow(isObject(raw), "ResourceSpans must be an object");
  const scopeSpans = raw.scopeSpans;
  assertOrThrow(
    scopeSpans === undefined || Array.isArray(scopeSpans),
    "ResourceSpans.scopeSpans must be an array",
  );
  const out: ResourceSpans = {
    scopeSpans: scopeSpans ? (scopeSpans as unknown[]).map(decodeScopeSpans) : [],
  };
  if (raw.resource !== undefined) out.resource = decodeResource(raw.resource);
  return out;
}

export function decodeTracesJson(body: unknown): ExportTraceServiceRequest {
  assertOrThrow(isObject(body), "ExportTraceServiceRequest must be an object");
  assertOrThrow(
    Array.isArray(body.resourceSpans),
    "ExportTraceServiceRequest.resourceSpans missing or not an array",
  );
  return {
    resourceSpans: (body.resourceSpans as unknown[]).map(decodeResourceSpans),
  };
}

// ---- Metrics (minimal) ---------------------------------------------------

function decodeNumberDataPoint(raw: unknown): NumberDataPoint {
  assertOrThrow(isObject(raw), "NumberDataPoint must be an object");
  const dp: NumberDataPoint = {
    attributes: decodeKeyValueList(raw.attributes),
  };
  if (raw.startTimeUnixNano !== undefined)
    dp.startTimeUnixNano = normalizeNano(raw.startTimeUnixNano);
  if (raw.timeUnixNano !== undefined) dp.timeUnixNano = normalizeNano(raw.timeUnixNano);
  if (typeof raw.asDouble === "number") dp.asDouble = raw.asDouble;
  if (typeof raw.asInt === "string" || typeof raw.asInt === "number") dp.asInt = raw.asInt;
  return dp;
}

function decodeMetric(raw: unknown): Metric {
  assertOrThrow(isObject(raw), "Metric must be an object");
  assertOrThrow(typeof raw.name === "string", "Metric.name must be a string");
  // Flatten Sum / Gauge / Histogram envelopes; only the dataPoints we use.
  let dataPoints: NumberDataPoint[] | undefined;
  for (const env of ["sum", "gauge"] as const) {
    const node = (raw as Record<string, unknown>)[env];
    if (isObject(node) && Array.isArray((node as { dataPoints?: unknown }).dataPoints)) {
      dataPoints = (node as { dataPoints: unknown[] }).dataPoints.map(decodeNumberDataPoint);
      break;
    }
  }
  const out: Metric = { name: raw.name };
  if (typeof raw.unit === "string") out.unit = raw.unit;
  if (dataPoints !== undefined) out.dataPoints = dataPoints;
  return out;
}

function decodeScopeMetrics(raw: unknown): ScopeMetrics {
  assertOrThrow(isObject(raw), "ScopeMetrics must be an object");
  const metrics = raw.metrics;
  assertOrThrow(
    metrics === undefined || Array.isArray(metrics),
    "ScopeMetrics.metrics must be an array",
  );
  return { metrics: metrics ? (metrics as unknown[]).map(decodeMetric) : [] };
}

function decodeResourceMetrics(raw: unknown): ResourceMetrics {
  assertOrThrow(isObject(raw), "ResourceMetrics must be an object");
  const sm = raw.scopeMetrics;
  assertOrThrow(
    sm === undefined || Array.isArray(sm),
    "ResourceMetrics.scopeMetrics must be an array",
  );
  const out: ResourceMetrics = {
    scopeMetrics: sm ? (sm as unknown[]).map(decodeScopeMetrics) : [],
  };
  if (raw.resource !== undefined) out.resource = decodeResource(raw.resource);
  return out;
}

export function decodeMetricsJson(body: unknown): ExportMetricsServiceRequest {
  assertOrThrow(isObject(body), "ExportMetricsServiceRequest must be an object");
  assertOrThrow(
    Array.isArray(body.resourceMetrics),
    "ExportMetricsServiceRequest.resourceMetrics missing or not an array",
  );
  return {
    resourceMetrics: (body.resourceMetrics as unknown[]).map(decodeResourceMetrics),
  };
}

// ---- Logs (minimal) ------------------------------------------------------

function decodeLogRecord(raw: unknown): LogRecord {
  assertOrThrow(isObject(raw), "LogRecord must be an object");
  const lr: LogRecord = { attributes: decodeKeyValueList(raw.attributes) };
  if (raw.timeUnixNano !== undefined) lr.timeUnixNano = normalizeNano(raw.timeUnixNano);
  if (raw.observedTimeUnixNano !== undefined)
    lr.observedTimeUnixNano = normalizeNano(raw.observedTimeUnixNano);
  if (typeof raw.severityNumber === "number") lr.severityNumber = raw.severityNumber;
  if (raw.body !== undefined) lr.body = decodeAnyValue(raw.body);
  if (typeof raw.traceId === "string") lr.traceId = raw.traceId;
  if (typeof raw.spanId === "string") lr.spanId = raw.spanId;
  return lr;
}

function decodeScopeLogs(raw: unknown): ScopeLogs {
  assertOrThrow(isObject(raw), "ScopeLogs must be an object");
  const logRecords = raw.logRecords;
  assertOrThrow(
    logRecords === undefined || Array.isArray(logRecords),
    "ScopeLogs.logRecords must be an array",
  );
  return { logRecords: logRecords ? (logRecords as unknown[]).map(decodeLogRecord) : [] };
}

function decodeResourceLogs(raw: unknown): ResourceLogs {
  assertOrThrow(isObject(raw), "ResourceLogs must be an object");
  const sl = raw.scopeLogs;
  assertOrThrow(sl === undefined || Array.isArray(sl), "ResourceLogs.scopeLogs must be an array");
  const out: ResourceLogs = {
    scopeLogs: sl ? (sl as unknown[]).map(decodeScopeLogs) : [],
  };
  if (raw.resource !== undefined) out.resource = decodeResource(raw.resource);
  return out;
}

export function decodeLogsJson(body: unknown): ExportLogsServiceRequest {
  assertOrThrow(isObject(body), "ExportLogsServiceRequest must be an object");
  assertOrThrow(
    Array.isArray(body.resourceLogs),
    "ExportLogsServiceRequest.resourceLogs missing or not an array",
  );
  return {
    resourceLogs: (body.resourceLogs as unknown[]).map(decodeResourceLogs),
  };
}
