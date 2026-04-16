import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/bematist";

// max=1 required by the migrator — it opens one connection for the advisory lock.
const client = postgres(url, { max: 1 });
const db = drizzle(client);

const migrationsFolder = join(import.meta.dir, "migrations");

await migrate(db, { migrationsFolder });
console.log(`[pg-migrate] done — applied migrations from ${migrationsFolder}`);

await client.end();
