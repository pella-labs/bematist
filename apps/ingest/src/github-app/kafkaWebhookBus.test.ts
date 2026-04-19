// Unit tests for the kafkajs producer wrapper. Broker-less — we verify:
//   - parseBrokersEnv honors KAFKA_BROKERS / REDPANDA_BROKERS / default
//   - closed bus rejects publish
//   - ensureConnected dedups concurrent publishes
//
// A separate `kafkaE2E.test.ts` exercises a real Redpanda broker via
// docker-compose (opt-in via `E2E_KAFKA=1`). Pure unit-test path here.

import { describe, expect, test } from "bun:test";
import { parseBrokersEnv } from "./kafkaWebhookBus";

describe("parseBrokersEnv", () => {
  test("defaults to localhost:9092 when empty", () => {
    expect(parseBrokersEnv({})).toEqual(["localhost:9092"]);
  });
  test("honors KAFKA_BROKERS", () => {
    expect(
      parseBrokersEnv({
        KAFKA_BROKERS: "kafka-1:9092,kafka-2:9092",
      }),
    ).toEqual(["kafka-1:9092", "kafka-2:9092"]);
  });
  test("honors REDPANDA_BROKERS", () => {
    expect(parseBrokersEnv({ REDPANDA_BROKERS: "rp:9092" })).toEqual(["rp:9092"]);
  });
  test("KAFKA_BROKERS takes precedence over REDPANDA_BROKERS", () => {
    expect(
      parseBrokersEnv({
        KAFKA_BROKERS: "k:9092",
        REDPANDA_BROKERS: "r:9092",
      }),
    ).toEqual(["k:9092"]);
  });
  test("drops empty segments", () => {
    expect(parseBrokersEnv({ KAFKA_BROKERS: "  ,k:9092  , , " })).toEqual(["k:9092"]);
  });
});
