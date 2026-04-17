// Hand-rolled minimal proto3 binary decoder for OTLP ExportTraceServiceRequest.
//
// SCOPE — exactly what the OTLP HTTP receiver needs in Sprint 1:
//   ExportTraceServiceRequest{1: resource_spans}
//   ResourceSpans{1: resource, 2: scope_spans}
//   ScopeSpans{1: scope, 2: spans}
//   Span{1: trace_id (bytes), 2: span_id (bytes), 4: parent_span_id (bytes),
//        5: name, 6: kind (varint), 7: start_time_unix_nano (fixed64),
//        8: end_time_unix_nano (fixed64), 9: attributes, 15: status}
//   Status{2: message, 3: code (varint)}
//   Resource{1: attributes}
//   InstrumentationScope{1: name, 2: version, 3: attributes}
//   KeyValue{1: key, 2: value}
//   AnyValue{1: string, 2: bool, 3: int (varint), 4: double, 5: array,
//            6: kvlist, 7: bytes}
//   ArrayValue{1: values}, KeyValueList{1: values}
//
// Unknown fields are skipped via wire-type generic skipper.
//
// This file is a deliberate stop-gap for Sprint 1 (D-S1-12). When Bun ≥ 1.3.4
// + buf CI step land in Sprint 2, swap to `@bufbuild/protobuf` generated
// runtime; the public functions (decodeTracesProto / encodeVarint /
// decodeVarint) stay stable so callers don't change.

import { OtlpDecodeError } from "./decode_json";
import type {
  AnyValue,
  ExportLogsServiceRequest,
  ExportMetricsServiceRequest,
  ExportTraceServiceRequest,
  InstrumentationScope,
  KeyValue,
  Resource,
  ResourceSpans,
  ScopeSpans,
  Span,
} from "./types";

// ---- Wire types ----------------------------------------------------------

const WIRE_VARINT = 0;
const WIRE_64BIT = 1;
const WIRE_LEN = 2;
const WIRE_32BIT = 5;

// ---- Varint --------------------------------------------------------------

/**
 * Decode a single proto3 varint starting at `offset`. Returns the value and
 * the next byte offset. Caps at 10 bytes (max for a 64-bit varint).
 */
export function decodeVarint(buf: Uint8Array, offset = 0): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (pos < buf.length) {
    const byte = buf[pos]!;
    pos++;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      // For values that exceed 32-bit, JS bitwise ops wrap. We instead
      // recompute via floats for safety on the rare large values.
      if (shift >= 28) {
        // Re-decode as a float (loses precision past 53 bits, fine for our use).
        let v = 0;
        let mul = 1;
        for (let p = offset; p < pos; p++) {
          v += (buf[p]! & 0x7f) * mul;
          mul *= 128;
        }
        return { value: v, next: pos };
      }
      // Force unsigned interpretation.
      return { value: result >>> 0, next: pos };
    }
    shift += 7;
    if (shift > 63) {
      throw new OtlpDecodeError("varint too long");
    }
  }
  throw new OtlpDecodeError("varint truncated");
}

/** Encode a non-negative integer as a proto3 varint. Used by tests. */
export function encodeVarint(value: number): Uint8Array {
  if (value < 0 || !Number.isFinite(value)) {
    throw new OtlpDecodeError("encodeVarint: negative or non-finite");
  }
  const out: number[] = [];
  let v = value;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v & 0x7f);
  return Uint8Array.from(out);
}

// ---- Tiny encoder helpers (test-only, exported for round-trip tests) -----

export function encodeTag(fieldNumber: number, wireType: number): Uint8Array {
  return encodeVarint((fieldNumber << 3) | wireType);
}

export function encodeLengthDelimited(fieldNumber: number, payload: Uint8Array): Uint8Array {
  const tag = encodeTag(fieldNumber, WIRE_LEN);
  const len = encodeVarint(payload.length);
  const out = new Uint8Array(tag.length + len.length + payload.length);
  out.set(tag, 0);
  out.set(len, tag.length);
  out.set(payload, tag.length + len.length);
  return out;
}

export function encodeString(fieldNumber: number, value: string): Uint8Array {
  return encodeLengthDelimited(fieldNumber, new TextEncoder().encode(value));
}

export function encodeBytes(fieldNumber: number, value: Uint8Array): Uint8Array {
  return encodeLengthDelimited(fieldNumber, value);
}

export function encodeVarintField(fieldNumber: number, value: number): Uint8Array {
  const tag = encodeTag(fieldNumber, WIRE_VARINT);
  const v = encodeVarint(value);
  const out = new Uint8Array(tag.length + v.length);
  out.set(tag, 0);
  out.set(v, tag.length);
  return out;
}

export function encodeFixed64(fieldNumber: number, value: bigint | number): Uint8Array {
  const tag = encodeTag(fieldNumber, WIRE_64BIT);
  const out = new Uint8Array(tag.length + 8);
  out.set(tag, 0);
  const dv = new DataView(out.buffer, tag.length, 8);
  // little-endian per proto wire format
  dv.setBigUint64(0, typeof value === "bigint" ? value : BigInt(value), true);
  return out;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// ---- Field iterator ------------------------------------------------------

interface Field {
  fieldNumber: number;
  wireType: number;
  /** For WIRE_LEN: payload subrange; for WIRE_VARINT: numeric value; for WIRE_64BIT: subarray of 8 bytes. */
  raw: Uint8Array | number;
}

function readBytes(
  buf: Uint8Array,
  offset: number,
  len: number,
): { bytes: Uint8Array; next: number } {
  if (offset + len > buf.length) throw new OtlpDecodeError("length-delimited overflow");
  return { bytes: buf.subarray(offset, offset + len), next: offset + len };
}

function bytesToHex(b: Uint8Array): string {
  let out = "";
  for (let i = 0; i < b.length; i++) out += b[i]?.toString(16).padStart(2, "0");
  return out;
}

/** Iterate fields in a proto message and dispatch to a handler. */
function forEachField(
  buf: Uint8Array,
  start: number,
  end: number,
  handle: (field: Field) => void,
): void {
  let pos = start;
  while (pos < end) {
    const tag = decodeVarint(buf, pos);
    pos = tag.next;
    const fieldNumber = tag.value >>> 3;
    const wireType = tag.value & 0x7;
    if (wireType === WIRE_VARINT) {
      const v = decodeVarint(buf, pos);
      pos = v.next;
      handle({ fieldNumber, wireType, raw: v.value });
    } else if (wireType === WIRE_LEN) {
      const lenRes = decodeVarint(buf, pos);
      pos = lenRes.next;
      const r = readBytes(buf, pos, lenRes.value);
      pos = r.next;
      handle({ fieldNumber, wireType, raw: r.bytes });
    } else if (wireType === WIRE_64BIT) {
      const r = readBytes(buf, pos, 8);
      pos = r.next;
      handle({ fieldNumber, wireType, raw: r.bytes });
    } else if (wireType === WIRE_32BIT) {
      const r = readBytes(buf, pos, 4);
      pos = r.next;
      handle({ fieldNumber, wireType, raw: r.bytes });
    } else {
      throw new OtlpDecodeError(`unsupported wire type ${wireType}`);
    }
  }
}

function readFixed64Nano(b: Uint8Array): string | number {
  const dv = new DataView(b.buffer, b.byteOffset, 8);
  const v = dv.getBigUint64(0, true);
  // Return as number when within safe-int range, else as decimal string.
  if (v <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(v);
  return v.toString();
}

// ---- Decoders ------------------------------------------------------------

function decodeAnyValueProto(buf: Uint8Array): AnyValue {
  const out: AnyValue = {};
  forEachField(buf, 0, buf.length, (f) => {
    if (f.fieldNumber === 1 && f.wireType === WIRE_LEN) {
      out.stringValue = new TextDecoder().decode(f.raw as Uint8Array);
    } else if (f.fieldNumber === 2 && f.wireType === WIRE_VARINT) {
      out.boolValue = (f.raw as number) !== 0;
    } else if (f.fieldNumber === 3 && f.wireType === WIRE_VARINT) {
      out.intValue = f.raw as number;
    } else if (f.fieldNumber === 4 && f.wireType === WIRE_64BIT) {
      const dv = new DataView((f.raw as Uint8Array).buffer, (f.raw as Uint8Array).byteOffset, 8);
      out.doubleValue = dv.getFloat64(0, true);
    } else if (f.fieldNumber === 5 && f.wireType === WIRE_LEN) {
      // ArrayValue { values=1 repeated AnyValue }
      const values: AnyValue[] = [];
      forEachField(f.raw as Uint8Array, 0, (f.raw as Uint8Array).length, (g) => {
        if (g.fieldNumber === 1 && g.wireType === WIRE_LEN) {
          values.push(decodeAnyValueProto(g.raw as Uint8Array));
        }
      });
      out.arrayValue = { values };
    } else if (f.fieldNumber === 6 && f.wireType === WIRE_LEN) {
      // KeyValueList { values=1 repeated KeyValue }
      const values: KeyValue[] = [];
      forEachField(f.raw as Uint8Array, 0, (f.raw as Uint8Array).length, (g) => {
        if (g.fieldNumber === 1 && g.wireType === WIRE_LEN) {
          values.push(decodeKeyValueProto(g.raw as Uint8Array));
        }
      });
      out.kvlistValue = { values };
    } else if (f.fieldNumber === 7 && f.wireType === WIRE_LEN) {
      out.bytesValue = bytesToHex(f.raw as Uint8Array);
    }
  });
  return out;
}

function decodeKeyValueProto(buf: Uint8Array): KeyValue {
  let key = "";
  let value: AnyValue = {};
  forEachField(buf, 0, buf.length, (f) => {
    if (f.fieldNumber === 1 && f.wireType === WIRE_LEN) {
      key = new TextDecoder().decode(f.raw as Uint8Array);
    } else if (f.fieldNumber === 2 && f.wireType === WIRE_LEN) {
      value = decodeAnyValueProto(f.raw as Uint8Array);
    }
  });
  return { key, value };
}

function decodeAttributes(buf: Uint8Array, fieldNumber: number): KeyValue[] {
  const attrs: KeyValue[] = [];
  forEachField(buf, 0, buf.length, (f) => {
    if (f.fieldNumber === fieldNumber && f.wireType === WIRE_LEN) {
      attrs.push(decodeKeyValueProto(f.raw as Uint8Array));
    }
  });
  return attrs;
}

function decodeResourceProto(buf: Uint8Array): Resource {
  return { attributes: decodeAttributes(buf, 1) };
}

function decodeScopeProto(buf: Uint8Array): InstrumentationScope {
  const out: InstrumentationScope = {};
  forEachField(buf, 0, buf.length, (f) => {
    if (f.fieldNumber === 1 && f.wireType === WIRE_LEN) {
      out.name = new TextDecoder().decode(f.raw as Uint8Array);
    } else if (f.fieldNumber === 2 && f.wireType === WIRE_LEN) {
      out.version = new TextDecoder().decode(f.raw as Uint8Array);
    } else if (f.fieldNumber === 3 && f.wireType === WIRE_LEN) {
      out.attributes ??= [];
      out.attributes.push(decodeKeyValueProto(f.raw as Uint8Array));
    }
  });
  return out;
}

function decodeSpanProto(buf: Uint8Array): Span {
  let traceId = "";
  let spanId = "";
  let parentSpanId: string | undefined;
  let name = "";
  let kind: number | undefined;
  let startTimeUnixNano: string | number = "0";
  let endTimeUnixNano: string | number = "0";
  let status: { code?: number; message?: string } | undefined;
  const attributes: KeyValue[] = [];
  forEachField(buf, 0, buf.length, (f) => {
    if (f.fieldNumber === 1 && f.wireType === WIRE_LEN) traceId = bytesToHex(f.raw as Uint8Array);
    else if (f.fieldNumber === 2 && f.wireType === WIRE_LEN)
      spanId = bytesToHex(f.raw as Uint8Array);
    else if (f.fieldNumber === 4 && f.wireType === WIRE_LEN)
      parentSpanId = bytesToHex(f.raw as Uint8Array);
    else if (f.fieldNumber === 5 && f.wireType === WIRE_LEN)
      name = new TextDecoder().decode(f.raw as Uint8Array);
    else if (f.fieldNumber === 6 && f.wireType === WIRE_VARINT) kind = f.raw as number;
    else if (f.fieldNumber === 7 && f.wireType === WIRE_64BIT)
      startTimeUnixNano = readFixed64Nano(f.raw as Uint8Array);
    else if (f.fieldNumber === 8 && f.wireType === WIRE_64BIT)
      endTimeUnixNano = readFixed64Nano(f.raw as Uint8Array);
    else if (f.fieldNumber === 9 && f.wireType === WIRE_LEN)
      attributes.push(decodeKeyValueProto(f.raw as Uint8Array));
    else if (f.fieldNumber === 15 && f.wireType === WIRE_LEN) {
      const s: { code?: number; message?: string } = {};
      forEachField(f.raw as Uint8Array, 0, (f.raw as Uint8Array).length, (g) => {
        if (g.fieldNumber === 2 && g.wireType === WIRE_LEN)
          s.message = new TextDecoder().decode(g.raw as Uint8Array);
        else if (g.fieldNumber === 3 && g.wireType === WIRE_VARINT) s.code = g.raw as number;
      });
      status = s;
    }
  });
  if (!traceId) throw new OtlpDecodeError("Span.traceId missing");
  if (!spanId) throw new OtlpDecodeError("Span.spanId missing");
  const span: Span = {
    traceId,
    spanId,
    name,
    startTimeUnixNano,
    endTimeUnixNano,
    attributes,
  };
  if (parentSpanId !== undefined) span.parentSpanId = parentSpanId;
  if (kind !== undefined) span.kind = kind;
  if (status !== undefined) span.status = status;
  return span;
}

function decodeScopeSpansProto(buf: Uint8Array): ScopeSpans {
  let scope: InstrumentationScope | undefined;
  const spans: Span[] = [];
  forEachField(buf, 0, buf.length, (f) => {
    if (f.fieldNumber === 1 && f.wireType === WIRE_LEN)
      scope = decodeScopeProto(f.raw as Uint8Array);
    else if (f.fieldNumber === 2 && f.wireType === WIRE_LEN)
      spans.push(decodeSpanProto(f.raw as Uint8Array));
  });
  const out: ScopeSpans = { spans };
  if (scope !== undefined) out.scope = scope;
  return out;
}

function decodeResourceSpansProto(buf: Uint8Array): ResourceSpans {
  let resource: Resource | undefined;
  const scopeSpans: ScopeSpans[] = [];
  forEachField(buf, 0, buf.length, (f) => {
    if (f.fieldNumber === 1 && f.wireType === WIRE_LEN)
      resource = decodeResourceProto(f.raw as Uint8Array);
    else if (f.fieldNumber === 2 && f.wireType === WIRE_LEN)
      scopeSpans.push(decodeScopeSpansProto(f.raw as Uint8Array));
  });
  const out: ResourceSpans = { scopeSpans };
  if (resource !== undefined) out.resource = resource;
  return out;
}

export function decodeTracesProto(buf: Uint8Array): ExportTraceServiceRequest {
  if (!(buf instanceof Uint8Array)) {
    throw new OtlpDecodeError("decodeTracesProto: input must be Uint8Array");
  }
  const resourceSpans: ResourceSpans[] = [];
  try {
    forEachField(buf, 0, buf.length, (f) => {
      if (f.fieldNumber === 1 && f.wireType === WIRE_LEN) {
        resourceSpans.push(decodeResourceSpansProto(f.raw as Uint8Array));
      }
    });
  } catch (e) {
    if (e instanceof OtlpDecodeError) throw e;
    throw new OtlpDecodeError(e instanceof Error ? e.message : String(e));
  }
  return { resourceSpans };
}

// ---- Metrics / Logs (thin stubs sufficient for mapping tests) -----------

export function decodeMetricsProto(buf: Uint8Array): ExportMetricsServiceRequest {
  // Sprint 1 mapper only consults JSON metrics; binary metrics decoder is a
  // pass-through stub so the OTLP server can return 200 partial-success. A
  // future Sprint 2 PR fleshes this out alongside session_start/end mapping.
  if (!(buf instanceof Uint8Array)) {
    throw new OtlpDecodeError("decodeMetricsProto: input must be Uint8Array");
  }
  return { resourceMetrics: [] };
}

export function decodeLogsProto(buf: Uint8Array): ExportLogsServiceRequest {
  if (!(buf instanceof Uint8Array)) {
    throw new OtlpDecodeError("decodeLogsProto: input must be Uint8Array");
  }
  return { resourceLogs: [] };
}
