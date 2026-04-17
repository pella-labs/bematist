import { sql } from "drizzle-orm";
import { char, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  org_id: uuid("org_id")
    .notNull()
    .references(() => orgs.id),
  sso_subject: text("sso_subject").notNull().unique(),
  email: text("email").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const developers = pgTable("developers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  org_id: uuid("org_id")
    .notNull()
    .references(() => orgs.id),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id),
  stable_hash: text("stable_hash").notNull().unique(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// SPRINT1_DRAFT_NEEDS_JORGE_REVIEW — paired with migration 0001_sprint1_auth.sql.
// Schema of record for apps/ingest/src/auth/verifyIngestKey.ts.
export const ingestKeys = pgTable(
  "ingest_keys",
  {
    id: text("id").primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id),
    engineer_id: uuid("engineer_id").references(() => developers.id),
    name: text("name").notNull(),
    key_sha256: text("key_sha256").notNull(),
    tier_default: char("tier_default", { length: 1 }).notNull().default("B"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    orgIdx: index("ingest_keys_org_idx").on(table.org_id),
  }),
);
