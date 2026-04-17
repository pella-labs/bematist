import { createClient } from "@clickhouse/client";

export const CH_URL = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
export const CH_DATABASE = process.env.CLICKHOUSE_DATABASE ?? "bematist";

export function ch() {
  return createClient({ url: CH_URL, database: CH_DATABASE });
}
