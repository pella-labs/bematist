import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./postgres/schema.ts",
  out: "./postgres/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/bematist",
  },
});
