import * as schema from "@bematist/schema/postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/bematist";

const client = postgres(url, { max: 5 });
export const db = drizzle(client, { schema });
export const pgClient = client;
