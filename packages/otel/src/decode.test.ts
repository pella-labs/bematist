import { describe, expect, test } from "bun:test";
import {
  concat,
  decodeLogsJson,
  decodeMetricsJson,
  decodeTracesJson,
  decodeTracesProto,
  decodeVarint,
  encodeBytes,
  encodeFixed64,
  encodeLengthDelimited,
  encodeString,
  encodeVarint,
  encodeVarintField,
  OtlpDecodeError,
} from "./index";

describe("varint", () => {
  test("decodeVarint of [0x96, 0x01] === 150 (proto wire spec example)", () => {
    const r = decodeVarint(Uint8Array.from([0x96, 0x01]));
    expect(r.value).toBe(150);
    expect(r.next).toBe(2);
  });

  test("encodeVarint(300) === [0xac, 0x02]", () => {
    const out = encodeVarint(300);
    expect(Array.from(out)).toEqual([0xac, 0x02]);
  });

  test("encode/decode round-trip for assorted values", () => {
    for (const n of [0, 1, 127, 128, 300, 16384, 1_000_000, 2 ** 31 - 1]) {
      const r = decodeVarint(encodeVarint(n));
      expect(r.value).toBe(n);
    }
  });

  test("truncated varint throws OtlpDecodeError", () => {
    expect(() => decodeVarint(Uint8Array.from([0x80]))).toThrow(OtlpDecodeError);
  });
});

describe("decodeTracesProto", () => {
  test("round-trips a hand-built ExportTraceServiceRequest with 1 span", () => {
    // KeyValue { key=1: "gen_ai.system", value=2: AnyValue{string=1: "anthropic"} }
    const anyValStr = encodeString(1, "anthropic");
    const anyVal = encodeLengthDelimited(2, anyValStr);
    const kv = concat(encodeString(1, "gen_ai.system"), anyVal);

    // KeyValue { key="dev_metrics.event_kind", value=string "llm_request" }
    const kindAnyValStr = encodeString(1, "llm_request");
    const kindAnyVal = encodeLengthDelimited(2, kindAnyValStr);
    const kvKind = concat(encodeString(1, "dev_metrics.event_kind"), kindAnyVal);

    // Span { trace_id=1: bytes(16), span_id=2: bytes(8), name=5: "gen_ai.request",
    //        start_time_unix_nano=7: fixed64, end_time_unix_nano=8: fixed64,
    //        attributes=9: KeyValue (twice) }
    const traceId = new Uint8Array(16);
    for (let i = 0; i < 16; i++) traceId[i] = i + 1;
    const spanId = new Uint8Array(8);
    for (let i = 0; i < 8; i++) spanId[i] = i + 1;
    const spanBody = concat(
      encodeBytes(1, traceId),
      encodeBytes(2, spanId),
      encodeString(5, "gen_ai.request.create"),
      encodeFixed64(7, 1_737_000_000_000_000_000n),
      encodeFixed64(8, 1_737_000_000_500_000_000n),
      encodeLengthDelimited(9, kv),
      encodeLengthDelimited(9, kvKind),
    );

    // ScopeSpans { spans = 2: repeated Span }
    const scopeSpansBody = encodeLengthDelimited(2, spanBody);
    const scopeSpans = encodeLengthDelimited(2, scopeSpansBody);
    // Resource { attributes=1: KeyValue("service.name","claude-code") }
    const svcNameVal = encodeLengthDelimited(2, encodeString(1, "claude-code"));
    const svcNameKv = concat(encodeString(1, "service.name"), svcNameVal);
    const resource = encodeLengthDelimited(1, svcNameKv);
    // ResourceSpans { resource=1, scope_spans=2 }
    const resourceSpans = concat(encodeLengthDelimited(1, resource), scopeSpans);
    // ExportTraceServiceRequest { resource_spans=1 }
    const buf = encodeLengthDelimited(1, resourceSpans);

    const req = decodeTracesProto(buf);
    expect(req.resourceSpans.length).toBe(1);
    const rs = req.resourceSpans[0]!;
    expect(rs.resource?.attributes[0]?.key).toBe("service.name");
    expect(rs.resource?.attributes[0]?.value.stringValue).toBe("claude-code");
    expect(rs.scopeSpans.length).toBe(1);
    const sp = rs.scopeSpans[0]?.spans[0];
    if (!sp) throw new Error("sp missing");
    expect(sp.name).toBe("gen_ai.request.create");
    expect(sp.traceId).toBe("0102030405060708090a0b0c0d0e0f10");
    expect(sp.spanId).toBe("0102030405060708");
    expect(sp.attributes?.find((a) => a.key === "gen_ai.system")?.value.stringValue).toBe(
      "anthropic",
    );
    expect(sp.attributes?.find((a) => a.key === "dev_metrics.event_kind")?.value.stringValue).toBe(
      "llm_request",
    );
  });

  test("skips unknown fields gracefully", () => {
    // varint at field 99 (unknown to ExportTraceServiceRequest), then a real
    // resource_spans field — decoder must skip the unknown and decode the rest.
    const unknown = encodeVarintField(99, 42);
    const resourceSpans = encodeLengthDelimited(1, new Uint8Array(0));
    const buf = concat(unknown, resourceSpans);
    const req = decodeTracesProto(buf);
    expect(req.resourceSpans.length).toBe(1);
  });
});

describe("decodeTracesJson", () => {
  test("accepts a known-good payload with hex traceId/spanId", () => {
    const body = {
      resourceSpans: [
        {
          resource: {
            attributes: [{ key: "service.name", value: { stringValue: "claude-code" } }],
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: "abcd1234abcd1234abcd1234abcd1234",
                  spanId: "1234567890abcdef",
                  name: "gen_ai.request.create",
                  startTimeUnixNano: "1737000000000000000",
                  endTimeUnixNano: "1737000000500000000",
                  attributes: [
                    { key: "gen_ai.system", value: { stringValue: "anthropic" } },
                    { key: "dev_metrics.event_kind", value: { stringValue: "llm_request" } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const req = decodeTracesJson(body);
    const sp = req.resourceSpans[0]?.scopeSpans[0]?.spans[0];
    if (!sp) throw new Error("sp missing");
    expect(sp.traceId).toBe("abcd1234abcd1234abcd1234abcd1234");
    expect(sp.spanId).toBe("1234567890abcdef");
    expect(sp.startTimeUnixNano).toBe("1737000000000000000");
  });

  test("throws OtlpDecodeError on missing resourceSpans", () => {
    expect(() => decodeTracesJson({})).toThrow(OtlpDecodeError);
  });

  test("Int64 nano accepted as both string and number", () => {
    const asString = decodeTracesJson({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: "00112233445566778899aabbccddeeff",
                  spanId: "0011223344556677",
                  name: "x",
                  startTimeUnixNano: "1737000000000000000",
                  endTimeUnixNano: "1737000000500000000",
                },
              ],
            },
          ],
        },
      ],
    });
    expect(typeof asString.resourceSpans[0]?.scopeSpans[0]?.spans[0]?.startTimeUnixNano).toBe(
      "string",
    );
    const asNumber = decodeTracesJson({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: "00112233445566778899aabbccddeeff",
                  spanId: "0011223344556677",
                  name: "x",
                  // Small enough to be safe-int.
                  startTimeUnixNano: 1_737_000_000,
                  endTimeUnixNano: 1_737_000_500,
                },
              ],
            },
          ],
        },
      ],
    });
    expect(typeof asNumber.resourceSpans[0]?.scopeSpans[0]?.spans[0]?.startTimeUnixNano).toBe(
      "number",
    );
  });
});

describe("decodeMetricsJson / decodeLogsJson", () => {
  test("metrics: decodes minimal sum-shaped envelope", () => {
    const req = decodeMetricsJson({
      resourceMetrics: [
        {
          resource: { attributes: [] },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: "dev_metrics.session_start",
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: "1737000000000000000",
                        asInt: "1",
                        attributes: [
                          { key: "dev_metrics.session_id", value: { stringValue: "sess_1" } },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(req.resourceMetrics[0]?.scopeMetrics[0]?.metrics[0]?.name).toBe(
      "dev_metrics.session_start",
    );
  });

  test("logs: decodes minimal logRecord with body and attributes", () => {
    const req = decodeLogsJson({
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: "1737000000000000000",
                  body: { stringValue: "tool_call:read_file" },
                  attributes: [
                    { key: "dev_metrics.event_kind", value: { stringValue: "tool_call" } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(req.resourceLogs[0]?.scopeLogs[0]?.logRecords[0]?.body?.stringValue).toBe(
      "tool_call:read_file",
    );
  });
});
