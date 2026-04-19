// Deterministic canonical JSON + sha256 for the linker's `inputs_sha256` gate
// (PRD §10 D53 idempotency key). Must be order-independent:
//   - objects: keys sorted lexicographically
//   - arrays: we DO NOT sort (ordering is meaningful for callers that pass
//     ordered sequences); instead, the caller passes arrays as already-sorted
//     sets (see state.ts for the sort contract).
//
// Why not JSON.stringify with a replacer?
//   - JSON.stringify(obj, Object.keys(obj).sort()) only sorts the TOP-LEVEL
//     keys; nested objects preserve insertion order.
//   - Buffer instances stringify to {type:"Buffer",data:[...]} by default.
//     We encode bytea / Buffer as lowercase hex so equal hashes serialize
//     identically regardless of Buffer source.
//
// Intentionally dependency-free.

import { createHash } from "node:crypto";

type JsonPrimitive = string | number | boolean | null;
type JsonArray = JsonInput[];
interface JsonObject {
  [k: string]: JsonInput;
}
export type JsonInput = JsonPrimitive | Buffer | Uint8Array | JsonArray | JsonObject;

export function canonicalJson(input: JsonInput): string {
  return encode(input);
}

export function canonicalSha256(input: JsonInput): Buffer {
  return createHash("sha256").update(canonicalJson(input), "utf8").digest();
}

function encode(v: JsonInput): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v))
      throw new Error(`canonical-json: non-finite number (${String(v)}) not representable`);
    return JSON.stringify(v);
  }
  if (typeof v === "string") return JSON.stringify(v);
  if (v instanceof Buffer) return JSON.stringify(v.toString("hex"));
  if (v instanceof Uint8Array) return JSON.stringify(Buffer.from(v).toString("hex"));
  if (Array.isArray(v)) return `[${v.map(encode).join(",")}]`;
  if (typeof v === "object") {
    const keys = Object.keys(v).sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${encode(v[k]!)}`);
    return `{${parts.join(",")}}`;
  }
  throw new Error(`canonical-json: unsupported value type ${typeof v}`);
}
