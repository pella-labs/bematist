// Bematist — @bematist/otel public surface.
//
// Sprint 1 Phase 5: hand-rolled minimal proto3 + proto3-JSON decoder for
// OTLP ExportTraceServiceRequest, plus a stable mapping API to bematist
// EventDraft. The runtime decoder is intentionally narrow — Sprint 2 swaps
// `decode_proto.ts` for `@bufbuild/protobuf` generated runtime once Bun ≥
// 1.3.4 + buf CI step land (D-S1-12, coord Jorge/Sebastian). The public
// mapping API stays stable across the swap.

export * from "./decode_json";
export * from "./decode_proto";
export * from "./kv";
export * from "./map";
export * from "./types";
